/**
 * Known mediators. The default is Estoc's own mediator-ts on Cloudflare
 * Workers; the local one is `npm run dev` in the mediator-ts repo, whose
 * identity is minted from MEDIATOR_PUBLIC_URL=http://localhost:8080.
 */

export const ESTOC_MEDIATOR =
  "did:peer:2.Ez6LSfL95Zj6FJmsiTPSqc4NkMWWmZbSUjJsDzjg6Lh6XXpVj.Vz6Mkr4MAov1H2MtYYqN1eiFnTd3wXKSjP5gFNtmnqHmXAFQf.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6Imh0dHBzOi8vbWVkaWF0b3IuZXN0b2MuZGV2IiwiYSI6WyJkaWRjb21tL3YyIl19fQ.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6IndzczovL21lZGlhdG9yLmVzdG9jLmRldiIsImEiOlsiZGlkY29tbS92MiJdfX0";

export const LOCAL_MEDIATOR =
  "did:peer:2.Ez6LSjXVLw9R8NLHtZHnV6bkKtXk4ZFzq1HyMxLuHrnd6xVDr.Vz6MkhwrTT4ctMXvQGtPiLr61qwa9mqDaLH7Ghebi62rbaQYQ.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MCIsImEiOlsiZGlkY29tbS92MiJdfX0.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6IndzOi8vbG9jYWxob3N0OjgwODAiLCJhIjpbImRpZGNvbW0vdjIiXX19";

export const MEDIATOR_CHOICES = [
  { label: "mediator.estoc.dev", did: ESTOC_MEDIATOR },
  { label: "localhost:8080", did: LOCAL_MEDIATOR },
];
