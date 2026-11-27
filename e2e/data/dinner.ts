// e2e/data/dinner.ts: the canonical "dinner for four" bill the #27 journeys drive, plus its
// HAND-COMPUTED expected totals. Journey 1 builds this bill through the UI (paste → people →
// claim → tip → payer); the other journeys seed it straight into IndexedDB (`dinnerBill()`)
// and start from a later step. Both routes must land on the same numbers below.
//
// ─── Items ───────────────────────────────────────────────────────────────────────────────
// The restaurant receipt (lib/receipt/fixtures/restaurant.txt, 8 items, $176.00), pasted,
// plus two lines typed with QuickAddRow: a $24.00 pitcher and `3 × Beer` at $21.00.
//
//   #  item               price   claimed by                         per person
//   0  Burrata            14.00   Ben 1 · Cy 1  (2-of-4 appetizer)   Ben 7.00  Cy 7.00
//   1  Caesar Salad       12.50   Ana                                Ana 12.50
//   2  Steak Frites ×2    58.00   Ben 1 · Cy 1                       Ben 29.00 Cy 29.00
//   3  Mushroom Risotto   24.00   Cy                                 Cy 24.00
//   4  Grilled Salmon     27.50   Dee                                Dee 27.50
//   5  Glass House Red ×2 24.00   Ana                                Ana 24.00
//   6  Sparkling Water     6.00   Dee                                Dee 6.00
//   7  Chocolate Torte    10.00   Ben                                Ben 10.00
//   8  Pitcher            24.00   Cy 2 : Dee 1  (weighted)           Cy 16.00  Dee 8.00
//   9  Beer (1/3)          7.00   Ana          ┐ `3 × Beer $21.00`,  Ana 7.00
//  10  Beer (2/3)          7.00   Ben          │ exploded: 2100/3    Ben 7.00
//  11  Beer (3/3)          7.00   Dee          ┘ = 700 each, exact   Dee 7.00
//
//   S = 176.00 + 24.00 + 21.00 = $221.00 (22100¢). Every item split above is exact, so no
//   item rounding happens anywhere.
//
//   Subtotals:  Ana 12.50 + 24.00 + 7.00               = 43.50  (4350)
//               Ben  7.00 + 29.00 + 10.00 + 7.00       = 53.00  (5300)
//               Cy   7.00 + 29.00 + 24.00 + 16.00      = 76.00  (7600)
//               Dee 27.50 +  6.00 +  8.00 + 7.00       = 48.50  (4850)
//               Σ = 221.00 ✓
//
// ─── Adjustments (spec §5.4) ──────────────────────────────────────────────────────────────
//   Tax 8.875% (the receipt's rate) of S: 22100 × 0.08875 = 1961.375 → $19.61. The tax field
//     takes at most 2 decimals of %, so it's entered as the amount 19.61 (the paste pre-fills
//     the receipt's own 15.62, which is 8.875% of the receipt's 176.00 only).
//   Delivery fee: $5.00 (500).
//   Tip: the default 20% pre-tax → 20% of S = 4420 → $44.20.
//   Grand total = 22100 + 1961 + 500 + 4420 = 28981 → $289.81.
//   Printed (re-entered to match the full bill): subtotal $221.00; total before tip
//     S + T + F = 22100 + 1961 + 500 = 24561 → $245.61.
//
// ─── Allocation (spec §5.5, proportional; payer rule §5.2) ────────────────────────────────
//   Dee paid. Weights are the subtotals, W = 22100 (no unclaimed). Non-payers get
//   round(amount × w / W), halves away from zero; Dee gets amount − Σ others.
//
//   Tax 1961:  Ana 1961×4350/22100 = 385.99 → 386
//              Ben 1961×5300/22100 = 470.29 → 470
//              Cy  1961×7600/22100 = 674.37 → 674
//              Dee 1961 − 386 − 470 − 674  = 431   (exact 430.36: Dee absorbs +0.64)
//   Fee 500:   Ana  500×4350/22100 =  98.42 →  98
//              Ben  500×5300/22100 = 119.91 → 120
//              Cy   500×7600/22100 = 171.95 → 172
//              Dee  500 − 98 − 120 − 172   = 110   (exact 109.73)
//   Tip 4420:  4420/22100 = 1/5 exactly → Ana 870, Ben 1060, Cy 1520, Dee 970
//
//   Totals:    Ana 4350 + 386 +  98 +  870 = 5704 → $57.04
//              Ben 5300 + 470 + 120 + 1060 = 6950 → $69.50
//              Cy  7600 + 674 + 172 + 1520 = 9966 → $99.66
//              Dee 4850 + 431 + 110 +  970 = 6361 → $63.61
//              Σ = 5704 + 6950 + 9966 + 6361 = 28981 = grand total ✓
//
// ─── Journey 6: remove Ana (all her items are hers alone) ─────────────────────────────────
//   Her 3 items (Caesar Salad, Glass House Red, Beer (1/3)) become unclaimed: $43.50.
//   The unclaimed pseudo-participant has Ana's old weight (4350) and, being a non-payer, gets
//   the same rounded shares she had (386 + 98 + 870), so Ben, Cy and Dee — the payer too,
//   since Σ others is unchanged — keep exactly the totals above (spec §5.5 stability).

import type { Bill, Item } from "../../lib/types";

export const PEOPLE = ["Ana", "Ben", "Cy", "Dee"] as const;
export type Name = (typeof PEOPLE)[number];

export const PAYER: Name = "Dee";

/** Lines typed after the paste, with QuickAddRow (`qty` shows the Qty field). */
export const EXTRA_ITEMS = [
  { name: "Pitcher", price: "24.00" },
  { name: "Beer", price: "21.00", qty: 3 },
] as const;

/** The tax for the full bill: 8.875% of $221.00, entered as an amount. */
export const TAX_AMOUNT = "19.61";
export const PRINTED_SUBTOTAL = "221.00";
export const PRINTED_TOTAL = "245.61";
export const FEE = { label: "Delivery", amount: "5" } as const;

/** Tap-claims per person (1 share each), by item name, as journey 1 makes them. */
export const TAP_CLAIMS: Record<Name, string[]> = {
  Ana: ["Caesar Salad", "Glass House Red", "Beer (1/3)"],
  Ben: ["Burrata", "Steak Frites", "Chocolate Torte", "Beer (2/3)"],
  Cy: ["Burrata", "Steak Frites", "Mushroom Risotto"],
  Dee: ["Grilled Salmon", "Sparkling Water", "Beer (3/3)"],
};

/** The weighted pitcher, set in ItemSplitSheet: Cy 2 : Dee 1. */
export const PITCHER_SHARES = { Cy: 2, Dee: 1 } as const;

export const EXPECTED = {
  subtotals: { Ana: 4350, Ben: 5300, Cy: 7600, Dee: 4850 },
  totals: { Ana: 5704, Ben: 6950, Cy: 9966, Dee: 6361 },
  itemsCents: 22100,
  taxCents: 1961,
  feeCents: 500,
  tipCents: 4420,
  grandCents: 28981,
} as const satisfies Record<string, unknown>;

export const id = (name: string) => `p-${name.toLowerCase()}`;

/** Item rows in receipt order: [name, quantity, priceCents]. */
const ITEMS: [string, number, number][] = [
  ["Burrata", 1, 1400],
  ["Caesar Salad", 1, 1250],
  ["Steak Frites", 2, 5800],
  ["Mushroom Risotto", 1, 2400],
  ["Grilled Salmon", 1, 2750],
  ["Glass House Red", 2, 2400],
  ["Sparkling Water", 1, 600],
  ["Chocolate Torte", 1, 1000],
  ["Pitcher", 1, 2400],
  ["Beer (1/3)", 1, 700],
  ["Beer (2/3)", 1, 700],
  ["Beer (3/3)", 1, 700],
];

/** Claims for an item name, from TAP_CLAIMS and PITCHER_SHARES. */
function claimsFor(item: string): Record<string, number> {
  if (item === "Pitcher") return Object.fromEntries(Object.entries(PITCHER_SHARES).map(([n, s]) => [id(n), s]));
  const claims: Record<string, number> = {};
  for (const n of PEOPLE) if (TAP_CLAIMS[n].includes(item)) claims[id(n)] = 1;
  return claims;
}

/**
 * The finished dinner as a `Partial<Bill>` for `seedBill`: everything journey 1 ends with.
 * `unclaimed` lists item names to leave with no claims (journey 2, journey 5).
 */
export function dinnerBill({ unclaimed = [] as string[] } = {}): Partial<Bill> {
  const items: Item[] = ITEMS.map(([name, quantity, priceCents], i) => ({
    id: `i${i}`,
    name,
    quantity,
    priceCents,
    claims: unclaimed.includes(name) ? {} : claimsFor(name),
  }));
  return {
    title: "Dinner for four",
    date: "2026-11-25",
    people: PEOPLE.map((name, colorIndex) => ({ id: id(name), name, colorIndex })),
    items,
    adjustments: [
      { id: "tax", kind: "tax", label: "Tax", value: { type: "amount", cents: EXPECTED.taxCents }, split: "proportional" },
      { id: "tip", kind: "tip", label: "Tip", value: { type: "percent", bps: 2000 }, basis: "pretax", split: "proportional" },
      { id: "fee", kind: "fee", label: FEE.label, value: { type: "amount", cents: EXPECTED.feeCents }, split: "proportional" },
    ],
    printed: { subtotalCents: 22100, totalCents: 24561 },
    paidBy: id(PAYER),
  };
}

export const ALL_ITEM_NAMES = ITEMS.map(([name]) => name);
