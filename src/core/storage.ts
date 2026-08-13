import type { ProfileData } from "./types.js";

/**
 * Everything lives in localStorage under one key: profiles, keys, message
 * history, envelope captures. Local-first in the most literal way a demo can
 * be — clearing site data is identity destruction, and the UI says so.
 */

const STORAGE_KEY = "estoc-didcomm-demo:v1";

export interface PersistedState {
  version: 1;
  profiles: ProfileData[];
  activeProfileId: string | null;
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.version === 1 && Array.isArray(parsed.profiles)) {
        for (const profile of parsed.profiles) {
          // predates the user-profile protocol
          profile.profileSharedWith ??= [];
        }
        return parsed;
      }
    }
  } catch {
    // fall through to a fresh state
  }
  return { version: 1, profiles: [], activeProfileId: null };
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
