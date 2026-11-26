// lib/testing/billFactory.ts: test-only builders for `Bill`s (a shared touch point: the #8
// split tests, the #13 share-codec tests and the #27 e2e fixtures import it). Keep the API
// small and stable; add, don't change.
//
// Two halves:
// - hand-built bills for worked examples: `makeBill`, `makePerson`, `makeItem`,
//   `makeAdjustment`, with `amount()` / `percent()` for the AmountSpec;
// - seeded random bills for property tests: `mulberry32`, `propertySeed`, `randomBill`.
//
// Everything is deterministic (no Date, no Math.random, no crypto) and framework-free.
// Every bill produced here is VALID per spec §4 (≤ 1 tax, ≤ 1 tip, shares 1..99, claims and
// paidBy/settled only reference people on the bill, amounts ≤ MAX_CENTS).

import type { Adjustment, AmountSpec, Bill, Cents, Item, Person, SplitMode } from "../types";

// ---------------------------------------------------------------------------------------
// Hand-built bills
// ---------------------------------------------------------------------------------------

/** Fixed SyncFields/date so a built bill deep-equals itself across runs. */
const FIXED_TIME = "2026-11-25T12:00:00.000Z";

/** A fixed-amount AmountSpec: `amount(500)` → $5.00 in USD. */
export function amount(cents: Cents): AmountSpec {
  return { type: "amount", cents };
}

/** A percent AmountSpec in basis points: `percent(825)` → 8.25%. */
export function percent(bps: number): AmountSpec {
  return { type: "percent", bps };
}

/** A person. `colorIndex` defaults to 0; pass it in overrides when it matters. */
export function makePerson(id: string, overrides: Partial<Omit<Person, "id">> = {}): Person {
  return { id, name: `Person ${id}`, colorIndex: 0, ...overrides };
}

/** An item. `claims` maps personId → shares; `{}` (the default) is unclaimed. */
export function makeItem(
  id: string,
  priceCents: Cents,
  claims: Record<string, number> = {},
  overrides: Partial<Omit<Item, "id" | "priceCents" | "claims">> = {},
): Item {
  return { id, name: `Item ${id}`, quantity: 1, priceCents, claims, ...overrides };
}

/** An adjustment. `split` defaults to "proportional"; a tip's `basis` is left unset (= "pretax"). */
export function makeAdjustment(
  id: string,
  kind: Adjustment["kind"],
  value: AmountSpec,
  overrides: Partial<Omit<Adjustment, "id" | "kind" | "value">> = {},
): Adjustment {
  const label = { tax: "Tax", tip: "Tip", fee: "Service charge", discount: "Discount" }[kind];
  return { id, kind, label, value, split: "proportional", ...overrides };
}

/** A bill with sensible defaults (USD, no people/items/adjustments, no payer). */
export function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill",
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    deletedAt: null,
    title: "Untitled bill",
    date: "2026-11-25",
    currency: "USD",
    people: [],
    items: [],
    adjustments: [],
    printed: {},
    paidBy: null,
    settled: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------------------

/** mulberry32: tiny seeded PRNG returning floats in [0, 1) (hand-rolled: no dependency). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed used when PROPERTY_SEED isn't set (local runs and PRs are reproducible). */
export const DEFAULT_PROPERTY_SEED = 20261125;

/**
 * Base seed for seeded property tests: `process.env.PROPERTY_SEED` (nightly CI sets it to
 * explore new cases) when it is a safe integer, else DEFAULT_PROPERTY_SEED. Print it on
 * failure so the run reproduces with `PROPERTY_SEED=<n> npm test`.
 */
export function propertySeed(): number {
  const raw = typeof process === "undefined" ? undefined : process.env.PROPERTY_SEED?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(n) ? n : DEFAULT_PROPERTY_SEED;
}

/** Integer in [min, max], inclusive. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(rand: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)];
}

const PEOPLE_NAMES = ["Alex", "Blair", "Casey", "Devon", "Emery", "Frankie", "Gray", "Harper", "Indigo", "Jules", "Kai", "Logan"];
const ITEM_NAMES = [
  "Margherita pizza",
  "Caesar salad",
  "IPA",
  "House red (glass)",
  "Fries",
  "Burger",
  "Sparkling water",
  "Tiramisu",
  "Pad thai",
  "Spring rolls",
  "Espresso",
  "Nachos to share",
];

export interface RandomBillOptions {
  /** Max people (inclusive). Default 8. A bill has 0 people about 5% of the time. */
  maxPeople?: number;
  /** Max items (inclusive). Default 12. A bill has 0 items about 5% of the time. */
  maxItems?: number;
  /** Fix the currency; default picks from USD / EUR / JPY. */
  currency?: string;
}

/**
 * A random, valid bill drawn from `rand` (use `mulberry32(seed)`), covering the edges:
 * no people, no items, $0 items, one big item, unclaimed items, weighted shares 1..99,
 * percent and fixed adjustments of every kind, both tip bases, both split modes, discounts
 * big enough to hit the clamp, printed totals, a payer and settled people.
 *
 * Sizes stay "real bill" (items subtotal ≤ about $100k) so every allocation product stays
 * under 2^53, the bound `allocate` documents.
 */
export function randomBill(rand: () => number, opts: RandomBillOptions = {}): Bill {
  const maxPeople = opts.maxPeople ?? 8;
  const maxItems = opts.maxItems ?? 12;

  const peopleCount = rand() < 0.05 ? 0 : randInt(rand, 1, maxPeople);
  const people: Person[] = Array.from({ length: peopleCount }, (_, i) => ({
    id: `p${i}`,
    name: `${pick(rand, PEOPLE_NAMES)} ${i}`,
    colorIndex: i % 8,
  }));

  const itemCount = rand() < 0.05 ? 0 : randInt(rand, 1, maxItems);
  const items: Item[] = Array.from({ length: itemCount }, (_, i) => {
    const r = rand();
    const priceCents = r < 0.08 ? 0 : r < 0.12 ? randInt(rand, 1, 9) : r < 0.15 ? randInt(rand, 100_000, 1_000_000) : randInt(rand, 50, 20_000);
    const claims: Record<string, number> = {};
    if (people.length > 0 && rand() >= 0.2) {
      const mode = rand();
      for (const p of people) {
        const joins = mode < 0.25 || rand() < 0.4; // "everyone", or a random subset
        if (joins) claims[p.id] = rand() < 0.75 ? 1 : randInt(rand, 1, 99);
      }
      if (Object.keys(claims).length === 0) claims[pick(rand, people).id] = 1;
    }
    return { id: `i${i}`, name: pick(rand, ITEM_NAMES), quantity: randInt(rand, 1, 4), priceCents, claims };
  });

  const adjustments: Adjustment[] = [];
  const spec = (maxCents: number, maxBps: number): AmountSpec =>
    rand() < 0.5 ? amount(randInt(rand, 0, maxCents)) : percent(randInt(rand, 0, maxBps));
  const split = (): SplitMode => (rand() < 0.7 ? "proportional" : "equal");
  const add = (kind: Adjustment["kind"], value: AmountSpec, extra: Partial<Adjustment> = {}) =>
    adjustments.push(makeAdjustment(`a${adjustments.length}`, kind, value, { split: split(), ...extra }));

  // Bill order is shuffled on purpose: the engine resolves in §5.4 order regardless.
  const kinds: Adjustment["kind"][] = [];
  if (rand() < 0.7) kinds.push("tax");
  if (rand() < 0.7) kinds.push("tip");
  for (let k = randInt(rand, 0, 2); k > 0; k--) kinds.push("fee");
  for (let k = rand() < 0.4 ? randInt(rand, 1, 3) : 0; k > 0; k--) kinds.push("discount");
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  for (const kind of kinds) {
    if (kind === "tax") add(kind, spec(5_000, 2_500));
    else if (kind === "tip") add(kind, spec(10_000, 3_000), rand() < 0.5 ? { basis: rand() < 0.5 ? "pretax" : "posttax" } : {});
    else if (kind === "fee") add(kind, spec(5_000, 2_000));
    else add(kind, rand() < 0.15 ? spec(5_000_000, 10_000) : spec(3_000, 5_000)); // sometimes huge: hits the clamp
  }

  const printed: Bill["printed"] = {};
  if (rand() < 0.3) printed.subtotalCents = randInt(rand, 0, 100_000);
  if (rand() < 0.3) printed.totalCents = randInt(rand, 0, 100_000);

  const paidBy = people.length > 0 && rand() < 0.6 ? pick(rand, people).id : null;
  const settled = people.filter((p) => p.id !== paidBy && rand() < 0.25).map((p) => p.id);

  return makeBill({
    currency: opts.currency ?? pick(rand, ["USD", "USD", "EUR", "JPY"]),
    people,
    items,
    adjustments,
    printed,
    paidBy,
    settled,
  });
}
