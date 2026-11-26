// Seeded property tests for the split engine (spec §5, §10). Bills come from
// `randomBill(mulberry32(seed))`. Nightly CI sets PROPERTY_SEED to explore new cases; a
// failure names the seed, so `PROPERTY_SEED=<n> npm test` reproduces it.

import { describe, expect, it } from "vitest";
import { computeSplit, previewItemSplit } from "./split";
import { mulberry32, propertySeed, randInt, randomBill } from "./testing/billFactory";
import type { Adjustment, Bill, PersonResult, SplitResult } from "./types";

const BASE_SEED = propertySeed();
const BILLS = 2500;

/** A seeded randomized test: each gets its own stream (BASE_SEED + offset), and failures print the seed. */
function property(name: string, offset: number, body: (rand: () => number, seed: number) => void) {
  it(name, () => {
    const seed = (BASE_SEED + offset) >>> 0;
    try {
      body(mulberry32(seed), seed);
    } catch (err) {
      if (err instanceof Error) {
        err.message = `${err.message}\n  ↳ seeded property failed: reproduce with PROPERTY_SEED=${BASE_SEED} (stream seed ${seed})`;
      }
      throw err;
    }
  });
}

/** Run `check` on BILLS random bills; on failure, say which bill. */
function forBills(rand: () => number, check: (bill: Bill, split: SplitResult, rand: () => number) => void) {
  for (let n = 0; n < BILLS; n++) {
    const bill = randomBill(rand);
    try {
      check(bill, computeSplit(bill), rand);
    } catch (err) {
      if (err instanceof Error) err.message = `${err.message}\n  ↳ on random bill #${n}: ${JSON.stringify(bill)}`;
      throw err;
    }
  }
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const abs = (x: bigint) => (x < 0n ? -x : x);

const COMPONENT = {
  discount: "discountCents",
  tax: "taxCents",
  fee: "feeCents",
  tip: "tipCents",
} as const satisfies Record<Adjustment["kind"], keyof PersonResult>;

describe("computeSplit properties (seeded, mulberry32)", () => {
  property("Σ people.totalCents + unclaimed.totalCents === grandTotalCents", 1, (rand) => {
    forBills(rand, (_bill, s) => {
      expect(sum(s.people.map((p) => p.totalCents)) + s.unclaimed.totalCents).toBe(s.grandTotalCents);
      expect(s.grandTotalCents).toBe(s.itemsSubtotalCents + sum(s.adjustments.map((a) => a.cents)));
    });
  });

  property("when balanced, Σ people.totalCents === grandTotalCents", 2, (rand) => {
    let balanced = 0;
    forBills(rand, (_bill, s) => {
      if (s.status !== "balanced") return;
      balanced++;
      expect(s.unclaimed).toEqual({ itemIds: [], itemsCents: 0, totalCents: 0 });
      expect(sum(s.people.map((p) => p.totalCents))).toBe(s.grandTotalCents);
    });
    expect(balanced).toBeGreaterThan(BILLS / 10); // the generator really exercises this branch
  });

  property("every amount is a safe integer, and each person's parts add up", 3, (rand) => {
    forBills(rand, (bill, s) => {
      expect(s.people.map((p) => p.personId)).toEqual(bill.people.map((p) => p.id));
      for (const p of s.people) {
        for (const v of [p.subtotalCents, p.discountCents, p.taxCents, p.feeCents, p.tipCents, p.totalCents]) {
          expect(Number.isSafeInteger(v)).toBe(true);
          expect(Object.is(v, -0)).toBe(false);
        }
        expect(p.subtotalCents).toBe(sum(p.lines.map((l) => l.cents)));
        expect(p.totalCents).toBe(p.subtotalCents + p.discountCents + p.taxCents + p.feeCents + p.tipCents);
        expect(p.discountCents).toBeLessThanOrEqual(0);
      }
      for (const v of [s.grandTotalCents, s.itemsSubtotalCents, s.unclaimed.itemsCents, s.unclaimed.totalCents]) {
        expect(Number.isSafeInteger(v)).toBe(true);
      }
    });
  });

  property("adjustments resolve in §5.4 order with the right signs, and D ≥ −S", 4, (rand) => {
    const rank = { discount: 0, tax: 1, fee: 2, tip: 3 };
    forBills(rand, (bill, s) => {
      expect(s.adjustments.map((a) => a.id).sort()).toEqual(bill.adjustments.map((a) => a.id).sort());
      const ranks = s.adjustments.map((a) => rank[a.kind]);
      expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
      for (const a of s.adjustments) {
        if (a.kind === "discount") expect(a.cents).toBeLessThanOrEqual(0);
        else expect(a.cents).toBeGreaterThanOrEqual(0);
      }
      const D = sum(s.adjustments.filter((a) => a.kind === "discount").map((a) => a.cents));
      expect(D).toBeGreaterThanOrEqual(-s.itemsSubtotalCents);
      expect(s.grandTotalCents).toBeGreaterThanOrEqual(0);
    });
  });

  property("item lines are within 1¢ of the exact rational share; unclaimed items go to no one", 5, (rand) => {
    forBills(rand, (bill, s) => {
      const known = new Set(bill.people.map((p) => p.id));
      bill.items.forEach((item) => {
        const claimed = Object.keys(item.claims).some((id) => known.has(id));
        expect(s.unclaimed.itemIds.includes(item.id)).toBe(!claimed);
        const lines = s.people.flatMap((p) => p.lines.filter((l) => l.itemId === item.id));
        expect(sum(lines.map((l) => l.cents))).toBe(claimed ? item.priceCents : 0);
        for (const l of lines) {
          // |cents − price·shares/total| < 1  ⇔  |cents·total − price·shares| < total
          const diff = BigInt(l.cents) * BigInt(l.totalShares) - BigInt(item.priceCents) * BigInt(l.shares);
          expect(abs(diff) < BigInt(l.totalShares)).toBe(true);
        }
      });
      expect(s.unclaimed.itemsCents).toBe(
        sum(bill.items.filter((i) => s.unclaimed.itemIds.includes(i.id)).map((i) => i.priceCents)),
      );
    });
  });

  property("each person's adjustment parts are within 1¢ per adjustment of the exact rational share", 6, (rand) => {
    forBills(rand, (bill, s) => {
      const n = bill.people.length;
      if (n === 0) {
        expect(s.unclaimed.totalCents).toBe(s.grandTotalCents);
        return;
      }
      const mode = new Map(bill.adjustments.map((a) => [a.id, a.split]));
      const subtotals = s.people.map((p) => p.subtotalCents);
      const S = s.itemsSubtotalCents;
      // Exact shares as fractions over the common denominator S·n (or n when S = 0).
      const den = BigInt(S > 0 ? S * n : n);
      const exact = (kind: Adjustment["kind"]) => {
        const num = new Array<bigint>(n + 1).fill(0n); // index n = the unclaimed pseudo-participant
        let count = 0;
        for (const a of s.adjustments) {
          if (a.kind !== kind) continue;
          count++;
          const c = BigInt(a.cents);
          if (mode.get(a.id) === "equal" || S === 0) {
            for (let i = 0; i < n; i++) num[i] += (c * den) / BigInt(n); // den is a multiple of n
          } else {
            for (let i = 0; i < n; i++) num[i] += (c * BigInt(subtotals[i]) * den) / BigInt(S);
            num[n] += (c * BigInt(s.unclaimed.itemsCents) * den) / BigInt(S);
          }
        }
        return { num, count };
      };
      // (c·w·den)/S is exact because den = S·n; likewise (c·den)/n. So these are true rationals.
      let unclaimedAdjustments = 0;
      for (const kind of ["discount", "tax", "fee", "tip"] as const) {
        const { num, count } = exact(kind);
        s.people.forEach((p, i) => {
          const diff = BigInt(p[COMPONENT[kind]]) * den - num[i];
          expect(abs(diff) < BigInt(Math.max(count, 1)) * den || (count === 0 && diff === 0n)).toBe(true);
          if (count === 0) expect(p[COMPONENT[kind]]).toBe(0);
        });
        unclaimedAdjustments += count;
      }
      // The pseudo-participant's adjustment share is within 1¢ per adjustment, too.
      const pseudoNum = (["discount", "tax", "fee", "tip"] as const).reduce((acc, k) => acc + exact(k).num[n], 0n);
      const pseudoCents = s.unclaimed.totalCents - s.unclaimed.itemsCents;
      expect(abs(BigInt(pseudoCents) * den - pseudoNum) < BigInt(Math.max(unclaimedAdjustments, 1)) * den).toBe(true);
    });
  });

  property("is deterministic: the same bill gives a deep-equal result", 7, (rand, seed) => {
    const again = mulberry32(seed);
    forBills(rand, (bill, s) => {
      expect(randomBill(again)).toEqual(bill); // the generator itself is deterministic
      expect(computeSplit(structuredClone(bill))).toEqual(s);
      expect(computeSplit(bill)).toEqual(s);
    });
  });

  property("does not mutate the bill", 8, (rand) => {
    forBills(rand, (bill) => {
      const before = structuredClone(bill);
      computeSplit(bill);
      expect(bill).toEqual(before);
    });
  });

  property("previewItemSplit equals the per-item lines of computeSplit", 9, (rand) => {
    forBills(rand, (bill, s) => {
      bill.items.forEach((item, itemIndex) => {
        const fromSplit: Record<string, number> = {};
        for (const p of s.people) {
          for (const l of p.lines) if (l.itemId === item.id) fromSplit[p.personId] = l.cents;
        }
        expect(previewItemSplit(item.priceCents, item.claims, bill.people, itemIndex)).toEqual(fromSplit);
      });
    });
  });

  property("claiming an unclaimed item only moves the claimant and unclaimed (others: ≤ 1¢ per proportional adjustment)", 10, (rand) => {
    let exercised = 0;
    forBills(rand, (bill, before, r) => {
      if (bill.people.length === 0 || before.unclaimed.itemIds.length === 0) return;
      exercised++;
      const itemId = before.unclaimed.itemIds[randInt(r, 0, before.unclaimed.itemIds.length - 1)];
      const k = randInt(r, 0, bill.people.length - 1);
      const claimant = bill.people[k].id;
      const claimed = structuredClone(bill);
      const item = claimed.items.find((i) => i.id === itemId)!;
      item.claims = { [claimant]: randInt(r, 1, 99) };
      const after = computeSplit(claimed);

      // The item moves from unclaimed to the claimant, whole.
      expect(after.unclaimed.itemIds).toEqual(before.unclaimed.itemIds.filter((id) => id !== itemId));
      expect(after.unclaimed.itemsCents).toBe(before.unclaimed.itemsCents - item.priceCents);
      expect(after.people[k].subtotalCents).toBe(before.people[k].subtotalCents + item.priceCents);
      expect(after.grandTotalCents).toBe(before.grandTotalCents);
      expect(after.adjustments).toEqual(before.adjustments);

      const mode = new Map(bill.adjustments.map((a) => [a.id, a.split]));
      const proportionalCount = (kind: Adjustment["kind"]) =>
        before.itemsSubtotalCents === 0
          ? 0 // proportional falls back to equal, which doesn't depend on claims at all
          : before.adjustments.filter((a) => a.kind === kind && mode.get(a.id) !== "equal").length;

      before.people.forEach((was, i) => {
        if (i === k) return;
        const now = after.people[i];
        // Items and subtotals: exactly unchanged.
        expect(now.lines).toEqual(was.lines);
        expect(now.subtotalCents).toBe(was.subtotalCents);
        expect(now.owesTo).toBe(was.owesTo);
        // Adjustments: each proportional share stays ⌊c·w/S⌋ or ⌈c·w/S⌉ of an UNCHANGED exact
        // share (W = S doesn't move), so only the leftover penny can re-rank: ≤ 1¢ each.
        // Equal shares don't depend on claims: exactly unchanged.
        for (const kind of ["discount", "tax", "fee", "tip"] as const) {
          const delta = Math.abs(now[COMPONENT[kind]] - was[COMPONENT[kind]]);
          expect(delta).toBeLessThanOrEqual(proportionalCount(kind));
        }
      });
    });
    expect(exercised).toBeGreaterThan(BILLS / 10);
  });
});
