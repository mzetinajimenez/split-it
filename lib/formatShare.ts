// lib/formatShare.ts: how much of an item a person had, as a compact fraction. Presentation
// only: it never touches money. `formatShare(2, 4)` → "½", `(1, 3)` → "⅓", `(2, 5)` → "2/5".
// A whole item (shares === totalShares) returns "" so the caller prints just the item name.

const VULGAR: Record<string, string> = {
  "1/2": "½",
  "1/3": "⅓",
  "2/3": "⅔",
  "1/4": "¼",
  "3/4": "¾",
};

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function formatShare(shares: number, totalShares: number): string {
  if (!Number.isInteger(shares) || !Number.isInteger(totalShares) || shares <= 0 || totalShares <= 0) return "";
  if (shares >= totalShares) return "";
  const g = gcd(shares, totalShares);
  const key = `${shares / g}/${totalShares / g}`;
  return VULGAR[key] ?? key;
}
