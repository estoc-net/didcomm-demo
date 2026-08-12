import { Resolver } from "did-resolver";
import { getResolver as webDidResolver } from "web-did-resolver";
import { resolveDIDCommDoc, toDIDCommDIDDoc } from "@estoc/did-peer";
import type { DIDDoc } from "@estoc/did-peer";

/**
 * The demo's composed DID resolver: did:web through DIF's web-did-resolver,
 * everything else falls through to @estoc/did-peer's pure decoder. This is
 * the resolver composition the package deliberately leaves to applications.
 *
 * `cache: true` keeps successful did:web lookups for the session — a chat
 * partner's keys changing mid-conversation is not a case this demo chases.
 * Failures are not cached, so a transient network error stays transient.
 */

const webResolver = new Resolver(webDidResolver(), { cache: true });

export async function resolveDid(did: string): Promise<DIDDoc | null> {
  if (!did.startsWith("did:web:")) {
    return resolveDIDCommDoc(did);
  }

  const { didDocument } = await webResolver.resolve(did);
  if (didDocument === null || didDocument.id !== did) {
    // A document claiming a different id than the DID that led to it is
    // someone else's document; using its keys would misattribute messages.
    return null;
  }

  try {
    return toDIDCommDIDDoc(didDocument as Record<string, unknown>);
  } catch {
    return null;
  }
}
