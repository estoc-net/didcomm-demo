import { base64urlToUtf8, resolvePeer2, toDIDCommDIDDoc } from "@estoc/did-peer";

/**
 * Known mediators. The default is Estoc's own mediator-ts on Cloudflare
 * Workers; the local one is `npm run dev` in the mediator-ts repo, whose
 * identity is minted from MEDIATOR_PUBLIC_URL=http://localhost:8080.
 */

export const ESTOC_MEDIATOR =
  "did:peer:2.Ez6LSfL95Zj6FJmsiTPSqc4NkMWWmZbSUjJsDzjg6Lh6XXpVj.Vz6Mkr4MAov1H2MtYYqN1eiFnTd3wXKSjP5gFNtmnqHmXAFQf.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6Imh0dHBzOi8vbWVkaWF0b3IuZXN0b2MuZGV2IiwiYSI6WyJkaWRjb21tL3YyIl19fQ.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6IndzczovL21lZGlhdG9yLmVzdG9jLmRldiIsImEiOlsiZGlkY29tbS92MiJdfX0";

/**
 * The same mediator (same keys, same endpoints) under its did:web name —
 * resolved from https://mediator.estoc.dev/.well-known/did.json instead of
 * decoded from the DID itself.
 */
export const ESTOC_MEDIATOR_WEB = "did:web:mediator.estoc.dev";

export const LOCAL_MEDIATOR =
  "did:peer:2.Ez6LSjXVLw9R8NLHtZHnV6bkKtXk4ZFzq1HyMxLuHrnd6xVDr.Vz6MkhwrTT4ctMXvQGtPiLr61qwa9mqDaLH7Ghebi62rbaQYQ.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MCIsImEiOlsiZGlkY29tbS92MiJdfX0.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6IndzOi8vbG9jYWxob3N0OjgwODAiLCJhIjpbImRpZGNvbW0vdjIiXX19";

export const MEDIATOR_CHOICES = [
  { label: "mediator.estoc.dev", did: ESTOC_MEDIATOR },
  { label: "mediator.estoc.dev (did:web)", did: ESTOC_MEDIATOR_WEB },
  { label: "localhost:8080", did: LOCAL_MEDIATOR },
];

export const OOB_INVITATION =
  "https://didcomm.org/out-of-band/2.0/invitation";

/**
 * A mediator can be handed over three ways, and they converge on its DID:
 * a DID pasted directly; an out-of-band invitation URL, whose `_oob`
 * parameter decodes to the invitation offline (the standard bootstrap, and
 * the DID inside is pinned by whoever handed over the URL); or a bare
 * mediator URL, probed with one GET for its JSON description — the only
 * form that has to trust what the server answers today.
 */
export async function resolveMediatorInput(input: string): Promise<string> {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("paste an invitation URL, a mediator URL, or a DID");
  }
  if (trimmed.startsWith("did:")) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("not a DID or a URL");
  }

  const oob = url.searchParams.get("_oob");
  if (oob !== null) {
    let invitation: { type?: unknown; from?: unknown };
    try {
      invitation = JSON.parse(base64urlToUtf8(oob)) as {
        type?: unknown;
        from?: unknown;
      };
    } catch {
      throw new Error("_oob does not decode to a JSON message");
    }
    if (invitation.type !== OOB_INVITATION || typeof invitation.from !== "string") {
      throw new Error("_oob is not an out-of-band 2.0 invitation");
    }
    return invitation.from;
  }

  let body: { did?: unknown } | null;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    body = (await res.json()) as { did?: unknown };
  } catch {
    throw new Error(`could not get a mediator description from ${url.host}`);
  }
  if (typeof body?.did !== "string" || !body.did.startsWith("did:")) {
    throw new Error(`${url.host} did not answer with a mediator DID`);
  }
  return body.did;
}

/** A human name for a mediator DID: the known label, or its HTTP endpoint host. */
export function mediatorLabel(did: string): string {
  const known = MEDIATOR_CHOICES.find((choice) => choice.did === did);
  if (known !== undefined) {
    return known.label;
  }
  if (did.startsWith("did:web:")) {
    // The DID is the domain: decode the host, drop any path segments.
    return decodeURIComponent(did.slice("did:web:".length).split(":")[0]);
  }
  try {
    const uri = toDIDCommDIDDoc(resolvePeer2(did))
      .service.map((service) =>
        typeof service.serviceEndpoint === "string"
          ? service.serviceEndpoint
          : service.serviceEndpoint.uri
      )
      .find((endpoint) => endpoint.startsWith("http"));
    if (uri !== undefined) {
      return new URL(uri).host;
    }
  } catch {
    // not a did:peer:2 — fall through to the generic label
  }
  return "custom mediator";
}
