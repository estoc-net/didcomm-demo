/** did:peer:4 long forms run ~800 characters; show head and tail. */
export function shortDid(did: string): string {
  return did.length <= 36 ? did : `${did.slice(0, 22)}…${did.slice(-8)}`;
}

const STOCK_NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi"];

/** First stock name no existing profile is using, so minting needs no typing. */
export function suggestName(taken: { name: string }[]): string {
  const used = new Set(taken.map((p) => p.name));
  return (
    STOCK_NAMES.find((n) => !used.has(n)) ?? `Profile ${taken.length + 1}`
  );
}

export function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
