# Estoc DIDComm Demo

A see-through DIDComm v2 messenger. On the surface it is a small chat app:
mint an identity in the browser, request mediation, exchange DIDs, talk. The
point is what every other messenger hides — each message keeps its envelopes,
and the inspector peels them layer by layer:

```
anoncrypt  → sealed anonymously to the recipient's mediator
  forward  → "queue this for `next`" — no sender, no content
   authcrypt → sealed to the recipient, authenticated by the sender
    plaintext → the message, visible to nobody in between
```

Each layer names who can read it, which makes the mediator's blindness — the
core of the metadata-minimization argument — something you can check rather
than believe.

## Run it

```sh
npm install
npm run dev
```

Profiles default to `mediator.estoc.dev` ([didcomm-mediator] on Cloudflare
Workers); the dropdown also offers a local mediator (`npm run dev` in the
didcomm-mediator repo, minted with `MEDIATOR_PUBLIC_URL=http://localhost:8080`).
For a one-browser demo, mint two profiles and introduce them to each other by
copying DIDs from the left rail.

Keys, contacts, and message history live in `localStorage` only. Clearing
site data destroys the identity — there is nothing to recover, which is the
local-first deal stated plainly.

## Verify

```sh
npm run typecheck
npm run e2e                     # two browser contexts against localhost:8080
E2E_MEDIATOR=estoc npm run e2e  # same flow against mediator.estoc.dev
```

The e2e script (playwright-core, system chromium) mints Alice and Bob in
isolated contexts, has them message each other, and asserts live WebSocket
delivery without reloads, four inspector layers on both sides, and history
surviving a reload.

## How it hangs together

- **Identities** are Multikey `did:peer:4` long forms (Ed25519 + X25519 via
  @noble/curves). Each profile holds two: one facing the mediator (service
  `didcomm:transport/queue`) and a public one whose service endpoint *is* the
  mediator's DID — the shapes pinned by didcomm-mediator's `demo-interop` test.
- **Packing is done by hand in two steps** (inner authcrypt, then an explicit
  `routing/2.0/forward` sealed anoncrypt to the mediator) instead of letting
  didcomm-rust wrap the forward internally. Same wire bytes; every layer
  passes through our hands so every layer can be shown.
- **Protocols**: coordinate-mediation/3.0, messagepickup/3.0 (drain on start,
  live delivery over WebSocket, acks over HTTP), routing/2.0, basicmessage/2.0.
- **did:peer lineage** (peer:2/4 codec, DIDDoc normalization) comes from
  [@estoc/did-peer], shared with [didcomm-mediator] and didcomm-http. Only the
  WASM shim stays local: the didcomm npm package's entry is webpack-shaped, so
  `src/didcomm/wasm.ts` instantiates it manually — the same shim
  didcomm-mediator uses on workerd, made async.

## Status

A demonstration, not a product: identities live in localStorage and nothing
here has received an independent security audit. Use it to see how DIDComm
works, not to carry real secrets.

## License

Apache-2.0

[@estoc/did-peer]: https://github.com/estoc-net/did-peer
[didcomm-mediator]: https://github.com/estoc-net/didcomm-mediator
