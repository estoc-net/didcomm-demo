import { reactive } from "vue";

import { ProfileAgent } from "./agent.js";
import { mintIdentity } from "./identity.js";
import { loadState, saveState } from "./storage.js";
import type { AgentStatus, ChatMessage, ProfileData } from "./types.js";

/**
 * The one store: persisted profiles wrapped in Vue reactivity, plus the
 * per-profile runtime (agent instance, connection status, activity log) that
 * never touches localStorage. Agents receive the reactive proxies, so their
 * mutations both render and persist.
 */

export interface ProfileRuntime {
  status: AgentStatus;
  log: string[];
}

const persisted = loadState();

export const state = reactive({
  profiles: persisted.profiles,
  activeProfileId: persisted.activeProfileId,
  runtimes: {} as Record<string, ProfileRuntime>,
});

const agents = new Map<string, ProfileAgent>();

function persist(): void {
  saveState({
    version: 1,
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
  });
}

function runtimeFor(id: string): ProfileRuntime {
  state.runtimes[id] ??= { status: { state: "idle" }, log: [] };
  return state.runtimes[id];
}

function startAgent(profile: ProfileData): void {
  const runtime = runtimeFor(profile.id);
  const agent = new ProfileAgent(profile, {
    onStatus(status) {
      runtime.status = status;
    },
    onMessage(message: ChatMessage) {
      // A first message from a stranger creates the contact, so it has a
      // thread to land in; the label is the DID until the user renames it.
      if (!profile.contacts.some((c) => c.did === message.contactDid)) {
        const did = message.contactDid;
        profile.contacts.push({
          did,
          label: did.length <= 30 ? did : `${did.slice(0, 20)}…${did.slice(-6)}`,
        });
      }
    },
    onChange: persist,
    onLog(line) {
      runtime.log.push(`${new Date().toLocaleTimeString()}  ${line}`);
      if (runtime.log.length > 200) {
        runtime.log.shift();
      }
    },
  });
  agents.set(profile.id, agent);
  void agent.start();
}

export function startAllAgents(): void {
  for (const profile of state.profiles) {
    if (!agents.has(profile.id)) {
      startAgent(profile);
    }
  }
}

export function createProfile(name: string, mediatorDid: string): ProfileData {
  const profile: ProfileData = {
    id: crypto.randomUUID(),
    name,
    mediatorDid,
    didForMediator: mintIdentity("didcomm:transport/queue", true),
    did: null,
    secrets: [],
    contacts: [],
    messages: [],
  };
  state.profiles.push(profile);
  const stored = state.profiles[state.profiles.length - 1];
  state.activeProfileId = profile.id;
  persist();
  startAgent(stored);
  return stored;
}

export function deleteProfile(id: string): void {
  agents.get(id)?.destroy();
  agents.delete(id);
  state.profiles = state.profiles.filter((profile) => profile.id !== id);
  delete state.runtimes[id];
  if (state.activeProfileId === id) {
    state.activeProfileId = state.profiles[0]?.id ?? null;
  }
  persist();
}

export function activeProfile(): ProfileData | null {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
}

export function selectProfile(id: string): void {
  state.activeProfileId = id;
  persist();
}

export function addContact(profileId: string, did: string, label: string): void {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (profile === undefined) {
    return;
  }
  // Adding a DID that already arrived as a stranger renames the auto-created
  // contact instead of duplicating it.
  const existing = profile.contacts.find((c) => c.did === did);
  if (existing !== undefined) {
    existing.label = label;
  } else {
    profile.contacts.push({ did, label });
  }
  persist();
}

export function removeContact(profileId: string, did: string): void {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (profile === undefined) {
    return;
  }
  profile.contacts = profile.contacts.filter((c) => c.did !== did);
  persist();
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
