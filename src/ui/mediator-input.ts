import { ref } from "vue";

import { MEDIATOR_CHOICES, resolveMediatorInput } from "../core/mediators.js";

/** Sentinel value for the "paste an invitation" entry in the dropdown. */
export const CUSTOM = "custom";

/**
 * The mediator half of a mint form, shared by first-run onboarding and the
 * profile rail: a dropdown of known mediators plus a paste field that takes
 * an OOB invitation URL, a bare mediator URL, or a DID.
 */
export function useMediatorInput() {
  const choice = ref<string>(MEDIATOR_CHOICES[0].did);
  const pasted = ref("");
  const resolving = ref(false);
  const error = ref<string | null>(null);

  /** The chosen mediator's DID, or null after leaving the reason in `error`. */
  async function resolveChoice(): Promise<string | null> {
    if (choice.value !== CUSTOM) {
      return choice.value;
    }
    error.value = null;
    resolving.value = true;
    try {
      return await resolveMediatorInput(pasted.value);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      resolving.value = false;
    }
  }

  return { choice, pasted, resolving, error, resolveChoice };
}
