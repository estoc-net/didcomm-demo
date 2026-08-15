import { reactive } from "vue";
import { createSeedKeystore, unlockSeedKeystore } from "@estoc/keystore";
import {
  Agent,
  Vault,
  chatView,
  currentDid,
  type ContactRecord,
} from "@estoc/agent-core";

import { Message } from "../didcomm/wasm.js";
import {
  backendFor,
  deleteVault,
  listVaultIds,
  loadActiveId,
  saveActiveId,
} from "./storage.js";
import type { AgentStatus, ChatMessage, Contact, ProfileData } from "./types.js";

/**
 * The one store: profile views wrapped in Vue reactivity, plus the
 * per-profile runtime (agent instance, connection status, activity log).
 * Each profile is a vault in OPFS; the agent writes there and reports back
 * through events, which update the views — so the UI renders what the
 * vault holds, never the other way round.
 *
 * Demo profiles seal their seed under an empty passphrase: exactly as
 * private as the raw keys in localStorage were, and one code path with the
 * real thing, which asks for a passphrase once and keeps the unlocked seed.
 */

const DEMO_PASSPHRASE = "";

export interface ProfileRuntime {
  status: AgentStatus;
  log: string[];
}

export const state = reactive({
  /** false until the vaults on disk have been listed */
  loaded: false,
  profiles: [] as ProfileData[],
  activeProfileId: loadActiveId(),
  runtimes: {} as Record<string, ProfileRuntime>,
});

const agents = new Map<string, Agent>();

function runtimeFor(id: string): ProfileRuntime {
  state.runtimes[id] ??= { status: { state: "idle" }, log: [] };
  return state.runtimes[id];
}

function contactView(record: ContactRecord): Contact {
  return {
    cid: record.cid,
    did: currentDid(record),
    label: record.name,
    ...(record.claimedName === undefined ? {} : { claimedName: record.claimedName }),
  };
}

function upsertContact(profile: ProfileData, record: ContactRecord): void {
  const view = contactView(record);
  const index = profile.contacts.findIndex((c) => c.cid === record.cid);
  if (index === -1) {
    profile.contacts.push(view);
  } else {
    profile.contacts[index] = view;
  }
}

async function attachAgent(profile: ProfileData, vault: Vault, seedKey: CryptoKey): Promise<void> {
  const runtime = runtimeFor(profile.id);
  const agent = new Agent({
    vault,
    seedKey,
    didcomm: { Message },
    events: {
      onStatus(status) {
        runtime.status = status;
        profile.did = agent.did;
      },
      onMessage(_record, view: ChatMessage) {
        profile.messages.push(view);
      },
      onContact(record) {
        upsertContact(profile, record);
      },
      onLog(line) {
        runtime.log.push(`${new Date().toLocaleTimeString()}  ${line}`);
        if (runtime.log.length > 200) {
          runtime.log.shift();
        }
      },
    },
  });
  agents.set(profile.id, agent);
  await agent.start();
}

/** Open one vault on disk into a profile view and start its agent. */
async function loadProfile(id: string): Promise<ProfileData | null> {
  const backend = await backendFor(id);
  if (!(await Vault.exists(backend))) {
    return null;
  }
  const vault = await Vault.open(backend);
  const seedKey = await unlockSeedKeystore(vault.keystore, DEMO_PASSPHRASE);
  const messages: ChatMessage[] = [];
  for (const record of await vault.messages.read()) {
    const view = chatView(record);
    if (view !== null) {
      messages.push(view);
    }
  }
  const profile: ProfileData = {
    id,
    name: vault.config.label,
    mediatorDid: vault.config.mediation?.mediatorDid ?? "",
    did: vault.config.mediation?.public?.did ?? null,
    contacts: (await vault.contacts.all()).map(contactView),
    messages,
  };
  state.profiles.push(profile);
  const stored = state.profiles[state.profiles.length - 1];
  void attachAgent(stored, vault, seedKey);
  return stored;
}

/** List the vaults in OPFS, load each, and bring its agent up. */
export async function loadProfiles(): Promise<void> {
  try {
    for (const id of await listVaultIds()) {
      if (!state.profiles.some((p) => p.id === id)) {
        try {
          await loadProfile(id);
        } catch (err) {
          runtimeFor(id).status = {
            state: "error",
            detail: `could not open vault: ${err instanceof Error ? err.message : err}`,
          };
        }
      }
    }
    if (!state.profiles.some((p) => p.id === state.activeProfileId)) {
      state.activeProfileId = state.profiles[0]?.id ?? null;
      saveActiveId(state.activeProfileId);
    }
  } finally {
    state.loaded = true;
  }
}

export async function createProfile(name: string, mediatorDid: string): Promise<ProfileData> {
  const id = crypto.randomUUID();
  const backend = await backendFor(id);
  const { doc, seedKey } = await createSeedKeystore(DEMO_PASSPHRASE);
  const vault = await Vault.create(backend, {
    label: name,
    keystore: doc,
    seedKey,
    mediatorDid,
  });
  const profile: ProfileData = {
    id,
    name,
    mediatorDid,
    did: null,
    contacts: [],
    messages: [],
  };
  state.profiles.push(profile);
  const stored = state.profiles[state.profiles.length - 1];
  state.activeProfileId = id;
  saveActiveId(id);
  void attachAgent(stored, vault, seedKey);
  return stored;
}

export async function deleteProfile(id: string): Promise<void> {
  agents.get(id)?.destroy();
  agents.delete(id);
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  delete state.runtimes[id];
  if (state.activeProfileId === id) {
    state.activeProfileId = state.profiles[0]?.id ?? null;
    saveActiveId(state.activeProfileId);
  }
  await deleteVault(id);
}

export function activeProfile(): ProfileData | null {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
}

export function selectProfile(id: string): void {
  state.activeProfileId = id;
  saveActiveId(id);
}

export async function addContact(profileId: string, did: string, label: string): Promise<void> {
  const agent = agents.get(profileId);
  const profile = state.profiles.find((p) => p.id === profileId);
  if (agent === undefined || profile === undefined) {
    return;
  }
  // Adding a DID that already arrived as a stranger renames the auto-created
  // contact instead of duplicating it — the agent handles that.
  upsertContact(profile, await agent.addContact(did, label));
}

export async function removeContact(profileId: string, did: string): Promise<void> {
  const agent = agents.get(profileId);
  const profile = state.profiles.find((p) => p.id === profileId);
  if (agent === undefined || profile === undefined) {
    return;
  }
  const contact = profile.contacts.find((c) => c.did === did);
  if (contact === undefined) {
    return;
  }
  await agent.removeContact(contact.cid);
  profile.contacts = profile.contacts.filter((c) => c.cid !== contact.cid);
}

export async function sendMessage(
  profileId: string,
  contactDid: string,
  text: string
): Promise<void> {
  const agent = agents.get(profileId);
  if (agent === undefined) {
    throw new Error("profile has no running agent");
  }
  await agent.sendBasicMessage(contactDid, text);
}
