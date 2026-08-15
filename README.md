# Estoc DIDComm Demo

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/estoc-net/didcomm-demo)

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

Keys, contacts, and message history live in this browser only: each profile
is an `.estoc` vault (see [@estoc/agent-core]) inside the Origin Private File
System, its seed sealed under an empty passphrase. Clearing site data destroys
the identity — there is nothing to recover, which is the local-first deal
stated plainly. (Profiles minted by earlier versions lived in `localStorage`;
they are left in place but no longer shown.)

## Deploy your own

The button above clones this repo into your GitHub account and deploys it to
workers.dev; `npm run deploy` from a checkout does the same (both run the
build first, via `build.command` in `wrangler.jsonc`). Custom domains attach
in the Cloudflare dashboard, not in `wrangler.jsonc`, so the config deploys
on any account unchanged.

To point the app at your own mediator, set `VITE_MEDIATOR_DID=<your
mediator's DID>` at build time — it replaces the Estoc entries as the
default choice, no source edits:

- **From a checkout**: put it in `.env.production` before `npm run deploy`.
- **On a button deploy**: prefix the **deploy command** on the setup page —
  `VITE_MEDIATOR_DID=… npm run deploy` — and your first deploy already
  defaults to your mediator. It must ride the deploy command, not the build
  command: deploying runs the final build (`build.command` in
  `wrangler.jsonc`), which would silently overwrite a value given only to
  the build step.
- **Changing it later**: add the variable under the Worker's
  **Settings → Build → Build variables** and push any commit — the button's
  initial seed build cannot be retried.

## Verify

```sh
npm run typecheck
npm run e2e                     # two browser contexts against localhost:8080
E2E_MEDIATOR=estoc npm run e2e  # same flow against mediator.estoc.dev
E2E_MEDIATOR=<url>  npm run e2e # …or against your own mediator's URL
```

The e2e script (playwright-core, system chromium) mints Alice and Bob in
isolated contexts, has them message each other, and asserts live WebSocket
delivery without reloads, four inspector layers on both sides, and history
surviving a reload.

## How it hangs together

- **The agent is [@estoc/agent-core]**: mediation, pickup, live delivery,
  the hand-layered packing, user-profile introductions, and the `.estoc`
  vault format (config, seed keystore, contacts, append-only message log)
  over an OPFS backend. This repo is the UI on top: `src/core/store.ts`
  mirrors each vault into Vue reactive views and forwards agent events.
- **Identities** come from one seed per profile ([@estoc/keystore] v2):
  the anchor `did:key`, a Multikey `did:peer:4` facing the mediator (no
  service — mail is picked up, never pushed), and a public `did:peer:4`
  whose service endpoint *is* the mediator's routing DID — the shapes pinned
  by didcomm-mediator's `demo-interop` test.
- **Packing is done by hand in two steps** (inner authcrypt, then an explicit
  `routing/2.0/forward` sealed anoncrypt to the mediator) instead of letting
  didcomm-rust wrap the forward internally. Same wire bytes; every layer
  passes through our hands so every layer can be shown.
- **Protocols**: coordinate-mediation/3.0, messagepickup/3.0 (drain on start,
  live delivery over WebSocket, acks over HTTP), routing/2.0, basicmessage/2.0,
  user-profile/1.0 (displayName only — announced automatically before the
  first message to a contact, answered when `send_back_yours` asks; the UI
  shows a received name as what the contact *claims* to be called, and never
  overwrites a label the user typed).
- **did:peer lineage** (peer:2/4 codec, DIDDoc normalization) comes from
  [@estoc/did-peer], shared with [didcomm-mediator] and didcomm-http. Only the
  WASM shim stays local: the didcomm npm package's entry is webpack-shaped, so
  `src/didcomm/wasm.ts` instantiates it manually — the same shim
  didcomm-mediator uses on workerd, made async — and hands `Message` to the
  agent.

## Status

A demonstration, not a product: keys live in the browser under an empty
passphrase and nothing here has received an independent security audit. Use it to see how DIDComm
works, not to carry real secrets.

## License

Apache-2.0

[@estoc/did-peer]: https://github.com/estoc-net/did-peer
[@estoc/agent-core]: https://github.com/estoc-net/agent-core
[@estoc/keystore]: https://github.com/estoc-net/keystore
[didcomm-mediator]: https://github.com/estoc-net/didcomm-mediator
