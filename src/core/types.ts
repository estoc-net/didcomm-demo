import type { AgentStatus, ChatMessage, EnvelopeLayer } from "@estoc/agent-core";

export type { AgentStatus, ChatMessage, EnvelopeLayer };

/**
 * What the UI renders: reactive views mirrored from a profile's vault. The
 * vault (in OPFS, via @estoc/agent-core) is the record; these are
 * projections kept in step by agent events.
 */

export interface Contact {
  /** the contact's cid in the vault */
  cid: string;
  /** their current DID */
  did: string;
  /** our petname for them */
  label: string;
  /**
   * The displayName the contact announced over user-profile/1.0 — what they
   * call themself, which is not what we necessarily call them, and never a
   * verified claim.
   */
  claimedName?: string;
}

export interface ProfileData {
  /** the vault's directory name under OPFS `vaults/` */
  id: string;
  name: string;
  mediatorDid: string;
  /** the public DID, minted after mediate-grant with the routing DID as its service */
  did: string | null;
  contacts: Contact[];
  messages: ChatMessage[];
}
