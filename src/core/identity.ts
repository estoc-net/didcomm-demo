import { ed25519, x25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

import { bytesToBase64url, encodeLongForm } from "@estoc/did-peer";
import type { Secret } from "@estoc/did-peer";

/**
 * Minting a demo agent identity: a Multikey did:peer:4 long form with one
 * Ed25519 authentication key and one X25519 key agreement key — the document
 * shape the mediator-ts demo-interop test pins. Two of these make up a
 * profile: one with no service at all (the DID the mediator knows — its mail
 * is picked up, never pushed), and one whose service is the mediator's DID
 * (the public DID a correspondent writes to, DIDComm v2 routing's blessed
 * shape).
 */

export interface AgentIdentity {
  did: string;
  secrets: Secret[];
}

/** multicodec prefixes for raw public keys */
const ED25519_PUB = [0xed, 0x01];
const X25519_PUB = [0xec, 0x01];

function multibaseKey(prefix: number[], publicKey: Uint8Array): string {
  const bytes = new Uint8Array(prefix.length + publicKey.length);
  bytes.set(prefix);
  bytes.set(publicKey, prefix.length);
  return `z${bs58.encode(bytes)}`;
}

export function mintIdentity(serviceUri: string | null): AgentIdentity {
  const edPriv = ed25519.utils.randomPrivateKey();
  const edPub = ed25519.getPublicKey(edPriv);
  const xPriv = x25519.utils.randomPrivateKey();
  const xPub = x25519.getPublicKey(xPriv);

  const did = encodeLongForm({
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    verificationMethod: [
      {
        id: "#key-1",
        type: "Multikey",
        publicKeyMultibase: multibaseKey(ED25519_PUB, edPub),
      },
      {
        id: "#key-2",
        type: "Multikey",
        publicKeyMultibase: multibaseKey(X25519_PUB, xPub),
      },
    ],
    authentication: ["#key-1"],
    capabilityDelegation: ["#key-1"],
    keyAgreement: ["#key-2"],
    ...(serviceUri === null
      ? {}
      : {
          service: [
            {
              type: "DIDCommMessaging",
              id: "#service",
              serviceEndpoint: {
                uri: serviceUri,
                accept: ["didcomm/v2"],
              },
            },
          ],
        }),
  });

  const secrets: Secret[] = [
    {
      id: `${did}#key-1`,
      type: "JsonWebKey2020",
      privateKeyJwk: {
        kty: "OKP",
        crv: "Ed25519",
        x: bytesToBase64url(edPub),
        d: bytesToBase64url(edPriv),
      },
    },
    {
      id: `${did}#key-2`,
      type: "JsonWebKey2020",
      privateKeyJwk: {
        kty: "OKP",
        crv: "X25519",
        x: bytesToBase64url(xPub),
        d: bytesToBase64url(xPriv),
      },
    },
  ];

  return { did, secrets };
}
