import { OpfsBackend } from "@estoc/agent-core";

/**
 * Where a profile lives: one `.estoc` vault per profile inside the Origin
 * Private File System, under `vaults/<id>/`. Local-first in the most literal
 * way a browser allows — clearing site data is identity destruction, and
 * the UI says so. Which profile is active is the only thing kept in
 * localStorage; it is a UI preference, not data.
 *
 * (Profiles minted before the vault format lived in localStorage under
 * `estoc-didcomm-demo:v1`. They are left untouched and no longer shown.)
 */

const VAULTS_DIR = "vaults";
const ACTIVE_KEY = "estoc-didcomm-demo:active";

async function vaultsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(VAULTS_DIR, { create: true });
}

/** The ids of every vault on disk, in name order. */
export async function listVaultIds(): Promise<string[]> {
  const dir = await vaultsDir();
  const ids: string[] = [];
  for await (const [name, entry] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (entry.kind === "directory") {
      ids.push(name);
    }
  }
  return ids.sort();
}

export async function backendFor(id: string): Promise<OpfsBackend> {
  const dir = await vaultsDir();
  return new OpfsBackend(await dir.getDirectoryHandle(id, { create: true }));
}

export async function deleteVault(id: string): Promise<void> {
  const dir = await vaultsDir();
  await dir.removeEntry(id, { recursive: true });
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function saveActiveId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, id);
  }
}
