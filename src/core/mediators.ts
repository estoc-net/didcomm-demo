import { base64urlToUtf8, resolvePeer2, toDIDCommDIDDoc } from "@estoc/did-peer";

/**
 * Known mediators. The default is Estoc's own mediator on Cloudflare
 * Workers under its did:web name — a mediator's DID is a function of its
 * keys and URL, and did:web is the name that stays put. The local entry is
 * `npm run dev` in the mediator repo: every checkout mints its own keys,
 * so there is no DID to hardcode — the entry is the URL, probed for its
 * DID at selection time.
 *
 * A fork points the demo at its own mediator without touching this file:
 * VITE_MEDIATOR_DID at build time (e.g. in .env.production) replaces the
 * Estoc entry as the default dropdown choice, labelled by the host its
 * DID names.
 */

export const ESTOC_MEDIATOR_WEB = "did:web:mediator.estoc.dev";

const CUSTOM_MEDIATOR = import.meta.env.VITE_MEDIATOR_DID?.trim();

/** Each entry's value is a DID, or a URL to probe for one when chosen. */
const LOCAL_CHOICE = { label: "localhost:8080", value: "http://localhost:8080" };

export const MEDIATOR_CHOICES =
  CUSTOM_MEDIATOR !== undefined && CUSTOM_MEDIATOR !== ""
    ? [
        {
          label: didHost(CUSTOM_MEDIATOR) ?? "custom mediator",
          value: CUSTOM_MEDIATOR,
        },
        LOCAL_CHOICE,
      ]
    : [
        { label: "mediator.estoc.dev", value: ESTOC_MEDIATOR_WEB },
        LOCAL_CHOICE,
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

/** The host a DID names: the did:web domain, or a did:peer:2 HTTP endpoint's. */
function didHost(did: string): string | undefined {
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
    // not a did:peer:2 — no host to derive
  }
  return undefined;
}

/** A human name for a mediator DID: the known label, or its HTTP endpoint host. */
export function mediatorLabel(did: string): string {
  const known = MEDIATOR_CHOICES.find((choice) => choice.value === did);
  if (known !== undefined) {
    return known.label;
  }
  return didHost(did) ?? "custom mediator";
}
