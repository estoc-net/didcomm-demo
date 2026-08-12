import type { Secret } from "@estoc/did-peer";

/**
 * One captured layer of a message's envelope onion, in transmission order for
 * sent messages and peeling order for received ones. `payload` is the exact
 * wire object, pretty-printed; `visibleTo` names who can read this layer.
 */
export interface EnvelopeLayer {
  kind: "plaintext" | "authcrypt" | "anoncrypt" | "forward";
  title: string;
  payload: string;
  visibleTo: string;
  note: string;
}

export interface ChatMessage {
  /** the plaintext message id — also the dedup key */
  id: string;
  direction: "sent" | "received";
  /** the counterparty's public DID */
  contactDid: string;
  content: string;
  time: number;
  layers: EnvelopeLayer[];
}

export interface Contact {
  did: string;
  label: string;
}

export interface ProfileData {
  id: string;
  name: string;
  mediatorDid: string;
  /** the DID the mediator knows — service is the queue transport */
  didForMediator: AgentKeys;
  /** the public DID, minted after mediate-grant with the routing DID as its service */
  did: string | null;
  secrets: Secret[];
  contacts: Contact[];
  messages: ChatMessage[];
}

export interface AgentKeys {
  did: string;
  secrets: Secret[];
}

export type AgentStatus =
  | { state: "idle" }
  | { state: "connecting"; detail: string }
  | { state: "live" }
  | { state: "error"; detail: string };
