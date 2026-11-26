// Worked examples for the split engine (spec §5). Every expected number is derived by hand
// in the comment next to it, not by running the engine.

import { describe, expect, it } from "vitest";
import { computeSplit, previewItemSplit, resolveAdjustments } from "./split";
import { amount, makeAdjustment, makeBill, makeItem, makePerson, percent } from "./testing/billFactory";
import type { PersonResult, SplitResult } from "./types";

const A = makePerson("A");
const B = makePerson("B");
const C = makePerson("C");

/** Pick the money fields of one person for compact assertions. */
function money(r: PersonResult) {
  const { subtotalCents, discountCents, taxCents, feeCents, tipCents, totalCents } = r;
  return { subtotalCents, discountCents, taxCents, feeCents, tipCents, totalCents };
}
const totals = (s: SplitResult) => s.people.map((p) => p.totalCents);
const reconciles = (s: SplitResult) =>
  s.people.reduce((acc, p) => acc + p.totalCents, 0) + s.unclaimed.totalCents === s.grandTotalCents;

describe("items (§5.3)", () => {
  it("one item shared by 2 of 3 people: the third pays 0 for it", () => {
    // $30.00 shared A+B → 1500 each; C claims a $9.00 item alone.
    const s = computeSplit(
      makeBill({ people: [A, B, C], items: [makeItem("i0", 3000, { A: 1, B: 1 }), makeItem("i1", 900, { C: 1 })] }),
    );
    expect(s.people.map((p) => p.subtotalCents)).toEqual([1500, 1500, 900]);
    expect(s.people[0].lines).toEqual([{ itemId: "i0", name: "Item i0", shares: 1, totalShares: 2, cents: 1500 }]);
    expect(s.people[2].lines.map((l) => l.itemId)).toEqual(["i1"]); // no line for i0 at all
    expect(s.status).toBe("balanced");
    expect(s.itemsSubtotalCents).toBe(3900);
    expect(s.grandTotalCents).toBe(3900);
  });

  it("weighted 2 : 1 shares", () => {
    // $10.00 × 2/3 = 666.67 → floor 666 (rem 2); × 1/3 = 333.33 → 333 (rem 1); the 1¢ leftover
    // goes to the larger remainder (A) → 667 / 333.
    const s = computeSplit(makeBill({ people: [A, B], items: [makeItem("i0", 1000, { A: 2, B: 1 })] }));
    expect(s.people[0].lines[0]).toMatchObject({ shares: 2, totalShares: 3, cents: 667 });
    expect(s.people[1].lines[0]).toMatchObject({ shares: 1, totalShares: 3, cents: 333 });
  });

  it("$100 split 3 ways → 33.34 / 33.33 / 33.33, with the penny rotating across 3 items", () => {
    // Each item: 10000/3 = 3333 r1. The leftover goes to (startIndex = itemIndex) mod 3.
    const items = [0, 1, 2].map((i) => makeItem(`i${i}`, 10000, { A: 1, B: 1, C: 1 }));
    const s = computeSplit(makeBill({ people: [A, B, C], items }));
    expect(s.people.map((p) => p.lines.map((l) => l.cents))).toEqual([
      [3334, 3333, 3333],
      [3333, 3334, 3333],
      [3333, 3333, 3334],
    ]);
    expect(totals(s)).toEqual([10000, 10000, 10000]);
  });

  it("orders claimants by bill.people, not by the claim map's key order", () => {
    // 1¢ across three ties → goes to person index (0 mod 3) = A, even though C is listed first.
    const s = computeSplit(makeBill({ people: [A, B, C], items: [makeItem("i0", 1, { C: 1, B: 1, A: 1 })] }));
    expect(s.people.map((p) => p.subtotalCents)).toEqual([1, 0, 0]);
  });

  it("ignores claims for ids not on the bill (they can't swallow money)", () => {
    const s = computeSplit(
      makeBill({ people: [A], items: [makeItem("i0", 1000, { A: 1, ghost: 1 }), makeItem("i1", 500, { ghost: 1 })] }),
    );
    expect(s.people[0].lines[0]).toMatchObject({ cents: 1000, totalShares: 1 });
    expect(s.unclaimed).toEqual({ itemIds: ["i1"], itemsCents: 500, totalCents: 500 });
    expect(reconciles(s)).toBe(true);
  });
});

describe("adjustments (§5.4, §5.5)", () => {
  // Shared fixture: A has $20.00, B has $10.00 → S = 3000. Two items, so adjustment j
  // tie-breaks from startIndex = 2 + j.
  const base = { people: [A, B], items: [makeItem("i0", 2000, { A: 1 }), makeItem("i1", 1000, { B: 1 })] };

  it("tax as an amount", () => {
    // $3.00 × 2000/3000 = 200, × 1000/3000 = 100 (exact).
    const s = computeSplit(makeBill({ ...base, adjustments: [makeAdjustment("t", "tax", amount(300))] }));
    expect(s.people.map((p) => p.taxCents)).toEqual([200, 100]);
    expect(totals(s)).toEqual([2200, 1100]);
    expect(s.grandTotalCents).toBe(3300);
  });

  it("tax as a percent", () => {
    // 8.25% of 3000 = 247.5 → 248 (half away from zero). 248 × 2/3 = 165.33 (rem 1000/3000),
    // × 1/3 = 82.67 (rem 2000/3000) → floors 165 + 82 = 247; the 1¢ goes to B → 165 / 83.
    const s = computeSplit(makeBill({ ...base, adjustments: [makeAdjustment("t", "tax", percent(825))] }));
    expect(s.adjustments).toEqual([{ id: "t", kind: "tax", label: "Tax", cents: 248 }]);
    expect(s.people.map((p) => p.taxCents)).toEqual([165, 83]);
    expect(totals(s)).toEqual([2165, 1083]);
    expect(s.grandTotalCents).toBe(3248);
  });

  describe("tip pre-tax vs post-tax, proportional vs equal", () => {
    // Tax 10% of 3000 = 300 → 200 / 100.
    const tax = makeAdjustment("t", "tax", percent(1000));

    it("pre-tax (the default), proportional: 20% of S = 600 → 400 / 200", () => {
      const s = computeSplit(makeBill({ ...base, adjustments: [tax, makeAdjustment("p", "tip", percent(2000))] }));
      expect(s.adjustments.map((a) => a.cents)).toEqual([300, 600]);
      expect(s.people.map(money)).toEqual([
        { subtotalCents: 2000, discountCents: 0, taxCents: 200, feeCents: 0, tipCents: 400, totalCents: 2600 },
        { subtotalCents: 1000, discountCents: 0, taxCents: 100, feeCents: 0, tipCents: 200, totalCents: 1300 },
      ]);
    });

    it("post-tax, proportional: 20% of S + T = 3300 → 660 → 440 / 220", () => {
      const tip = makeAdjustment("p", "tip", percent(2000), { basis: "posttax" });
      const s = computeSplit(makeBill({ ...base, adjustments: [tax, tip] }));
      expect(s.adjustments.map((a) => a.cents)).toEqual([300, 660]);
      expect(s.people.map((p) => p.tipCents)).toEqual([440, 220]);
      expect(totals(s)).toEqual([2640, 1320]);
      expect(s.grandTotalCents).toBe(3960);
    });

    it("pre-tax, equal: 15% of 3000 = 450 → 225 / 225", () => {
      const tip = makeAdjustment("p", "tip", percent(1500), { split: "equal" });
      const s = computeSplit(makeBill({ ...base, adjustments: [tax, tip] }));
      expect(s.people.map((p) => p.tipCents)).toEqual([225, 225]);
    });

    it("post-tax, equal: 15% of 3300 = 495 → 495/2 = 247 r1; the 1¢ goes to startIndex 3 mod 2 = B", () => {
      const tip = makeAdjustment("p", "tip", percent(1500), { split: "equal", basis: "posttax" });
      const s = computeSplit(makeBill({ ...base, adjustments: [tax, tip] }));
      expect(s.adjustments[1].cents).toBe(495);
      expect(s.people.map((p) => p.tipCents)).toEqual([247, 248]);
    });

    it("post-tax includes discounts and fees: base = S + D + T + F", () => {
      // D = −10% of 3000 = −300; T = 10% of 2700 = 270; F = 30 flat; base = 3000 − 300 + 270 + 30
      // = 3000 → tip 20% = 600.
      const s = computeSplit(
        makeBill({
          ...base,
          adjustments: [
            makeAdjustment("p", "tip", percent(2000), { basis: "posttax" }),
            makeAdjustment("f", "fee", amount(30)),
            tax,
            makeAdjustment("d", "discount", percent(1000)),
          ],
        }),
      );
      expect(s.adjustments.map((a) => [a.id, a.cents])).toEqual([
        ["d", -300],
        ["t", 270],
        ["f", 30],
        ["p", 600],
      ]);
    });
  });

  it("a fee split equally, including a person with no items", () => {
    // $5.00 / 3 = 166 r2 each. Fee j = 0 → startIndex 2: ties go to C (2), then A (0).
    const s = computeSplit(
      makeBill({ ...base, people: [A, B, C], adjustments: [makeAdjustment("f", "fee", amount(500), { split: "equal" })] }),
    );
    expect(s.people.map((p) => p.feeCents)).toEqual([167, 166, 167]);
    expect(s.people[2]).toMatchObject({ lines: [], subtotalCents: 0, totalCents: 167 });
    expect(s.status).toBe("balanced");
    expect(s.grandTotalCents).toBe(3500);
  });

  it("a discount by % and by amount, with tax on the discounted subtotal", () => {
    // D1 = −10% of 3000 = −300 (start 2) → −200 / −100.
    // D2 = −$5.00 (start 3): 500 × 2/3 = 333.33 (rem 1000), × 1/3 = 166.67 (rem 2000) → −333 / −167.
    // D = −800. T = 10% of 2200 = 220 (start 4): 146.67 (rem 2000) / 73.33 (rem 1000) → 147 / 73.
    const s = computeSplit(
      makeBill({
        ...base,
        adjustments: [
          makeAdjustment("t", "tax", percent(1000)),
          makeAdjustment("d1", "discount", percent(1000)),
          makeAdjustment("d2", "discount", amount(500)),
        ],
      }),
    );
    expect(s.adjustments.map((a) => [a.id, a.cents])).toEqual([
      ["d1", -300],
      ["d2", -500],
      ["t", 220],
    ]);
    expect(s.people.map(money)).toEqual([
      { subtotalCents: 2000, discountCents: -533, taxCents: 147, feeCents: 0, tipCents: 0, totalCents: 1614 },
      { subtotalCents: 1000, discountCents: -267, taxCents: 73, feeCents: 0, tipCents: 0, totalCents: 806 },
    ]);
    expect(s.grandTotalCents).toBe(2420);
  });

  it("clamps discounts to −S, taking the shortfall off the last discount", () => {
    // −60% of 3000 = −1800, −$20.00 → D = −3800, 800 too far: the last becomes −1200. D = −3000.
    // Tax 10% of 0 = 0. Pre-tax tip still uses S: 20% of 3000 = 600.
    const s = computeSplit(
      makeBill({
        ...base,
        adjustments: [
          makeAdjustment("d1", "discount", percent(6000)),
          makeAdjustment("d2", "discount", amount(2000)),
          makeAdjustment("t", "tax", percent(1000)),
          makeAdjustment("p", "tip", percent(2000)),
        ],
      }),
    );
    expect(s.adjustments.map((a) => [a.id, a.cents])).toEqual([
      ["d1", -1800],
      ["d2", -1200],
      ["t", 0],
      ["p", 600],
    ]);
    expect(s.people.map((p) => p.discountCents)).toEqual([-2000, -1000]);
    expect(totals(s)).toEqual([400, 200]);
    expect(s.grandTotalCents).toBe(600);
  });

  it("when the last discount is smaller than the shortfall, the rest comes off the one before", () => {
    // S = 1000; −2900 and −50: 1950 too far → last −50 → 0, the remaining 1900 → first −1000.
    const s = computeSplit(
      makeBill({
        people: [A],
        items: [makeItem("i0", 1000, { A: 1 })],
        adjustments: [makeAdjustment("d1", "discount", amount(2900)), makeAdjustment("d2", "discount", amount(50))],
      }),
    );
    expect(s.adjustments.map((a) => a.cents)).toEqual([-1000, 0]);
    expect(Object.is(s.adjustments[1].cents, 0)).toBe(true); // +0, not −0
    expect(s.grandTotalCents).toBe(0);
  });

  it("unclaimed items carry their proportional tax/tip on the pseudo-participant", () => {
    // A claims $20.00; a $10.00 item is unclaimed. Weights [2000, 1000 (unclaimed)].
    // Tax 10% of 3000 = 300 → 200 / 100. Tip 20% pre-tax = 600 → 400 / 200.
    // An equal fee of $1.00 → all to A (the pseudo-participant takes no part in equal splits).
    const s = computeSplit(
      makeBill({
        people: [A],
        items: [makeItem("i0", 2000, { A: 1 }), makeItem("i1", 1000)],
        adjustments: [
          makeAdjustment("t", "tax", percent(1000)),
          makeAdjustment("p", "tip", percent(2000)),
          makeAdjustment("f", "fee", amount(100), { split: "equal" }),
        ],
      }),
    );
    expect(s.status).toBe("unclaimed");
    expect(money(s.people[0])).toEqual({
      subtotalCents: 2000,
      discountCents: 0,
      taxCents: 200,
      feeCents: 100,
      tipCents: 400,
      totalCents: 2700,
    });
    expect(s.unclaimed).toEqual({ itemIds: ["i1"], itemsCents: 1000, totalCents: 1300 });
    expect(s.grandTotalCents).toBe(4000);
    expect(reconciles(s)).toBe(true);
  });

  it("proportional falls back to equal when every weight is 0 (no items, a flat fee)", () => {
    // $5.01 / 2 = 250 r1; startIndex = 0 items + 0 → A gets the penny.
    const s = computeSplit(makeBill({ people: [A, B], adjustments: [makeAdjustment("f", "fee", amount(501))] }));
    expect(s.people.map((p) => p.feeCents)).toEqual([251, 250]);
    expect(s.status).toBe("empty");
    expect(s.unclaimed.totalCents).toBe(0);
  });

  it("proportional falls back to equal when every item is $0", () => {
    const s = computeSplit(
      makeBill({ people: [A, B], items: [makeItem("i0", 0, { A: 1 })], adjustments: [makeAdjustment("f", "fee", amount(100))] }),
    );
    expect(s.people.map((p) => p.feeCents)).toEqual([50, 50]);
    expect(s.status).toBe("balanced");
  });

  it("uses startIndex = items.length + j for adjustment j", () => {
    // Three equal 1¢ fees across 3 people, 1 item → starts 1, 2, 3 → B, C, A.
    const s = computeSplit(
      makeBill({
        people: [A, B, C],
        items: [makeItem("i0", 0, { A: 1 })],
        adjustments: ["f0", "f1", "f2"].map((id) => makeAdjustment(id, "fee", amount(1), { split: "equal" })),
      }),
    );
    expect(s.people.map((p) => p.feeCents)).toEqual([1, 1, 1]);
    const one = computeSplit(
      makeBill({
        people: [A, B, C],
        items: [makeItem("i0", 0, { A: 1 })],
        adjustments: [makeAdjustment("f0", "fee", amount(1), { split: "equal" })],
      }),
    );
    expect(one.people.map((p) => p.feeCents)).toEqual([0, 1, 0]);
  });
});

describe("resolveAdjustments", () => {
  it("returns signed cents in §5.4 order (discounts, tax, fees, tip), bill order within a kind", () => {
    const bill = makeBill({
      items: [makeItem("i0", 10000)],
      adjustments: [
        makeAdjustment("p", "tip", percent(1800)),
        makeAdjustment("f1", "fee", amount(250)),
        makeAdjustment("d", "discount", amount(1000)),
        makeAdjustment("t", "tax", percent(825)),
        makeAdjustment("f2", "fee", percent(300)),
      ],
    });
    // D = −1000; T = 8.25% of 9000 = 742.5 → 743; F2 = 3% of 9000 = 270; tip 18% of 10000 = 1800.
    expect(resolveAdjustments(bill)).toEqual([
      { id: "d", kind: "discount", label: "Discount", cents: -1000 },
      { id: "t", kind: "tax", label: "Tax", cents: 743 },
      { id: "f1", kind: "fee", label: "Service charge", cents: 250 },
      { id: "f2", kind: "fee", label: "Service charge", cents: 270 },
      { id: "p", kind: "tip", label: "Tip", cents: 1800 },
    ]);
    expect(computeSplit(bill).adjustments).toEqual(resolveAdjustments(bill));
  });

  it("never produces −0 for a zero discount", () => {
    const [d] = resolveAdjustments(makeBill({ adjustments: [makeAdjustment("d", "discount", percent(1000))] }));
    expect(Object.is(d.cents, 0)).toBe(true);
  });
});

describe("edge sizes", () => {
  it("no people: everything is unclaimed", () => {
    const s = computeSplit(
      makeBill({ items: [makeItem("i0", 1000), makeItem("i1", 500)], adjustments: [makeAdjustment("t", "tax", percent(1000))] }),
    );
    expect(s.people).toEqual([]);
    expect(s.unclaimed).toEqual({ itemIds: ["i0", "i1"], itemsCents: 1500, totalCents: 1650 });
    expect(s.grandTotalCents).toBe(1650);
    expect(s.status).toBe("unclaimed");
  });

  it("no people and no items: empty, a flat fee is still reported unclaimed", () => {
    const s = computeSplit(makeBill({ adjustments: [makeAdjustment("f", "fee", amount(500))] }));
    expect(s).toEqual({
      people: [],
      itemsSubtotalCents: 0,
      adjustments: [{ id: "f", kind: "fee", label: "Service charge", cents: 500 }],
      grandTotalCents: 500,
      unclaimed: { itemIds: [], itemsCents: 0, totalCents: 500 },
      status: "empty",
      printed: { subtotalDiffCents: null, totalDiffCents: null },
    });
  });

  it("no items: empty", () => {
    const s = computeSplit(makeBill({ people: [A, B] }));
    expect(s.status).toBe("empty");
    expect(totals(s)).toEqual([0, 0]);
    expect(s.grandTotalCents).toBe(0);
  });

  it("a single person pays everything", () => {
    // 1234 + 567 = 1801; tip 20% pre-tax = 360.2 → 360.
    const s = computeSplit(
      makeBill({
        people: [A],
        items: [makeItem("i0", 1234, { A: 1 }), makeItem("i1", 567, { A: 3 })],
        adjustments: [makeAdjustment("t", "tax", percent(888)), makeAdjustment("p", "tip", percent(2000))],
      }),
    );
    // 8.88% of 1801 = 159.93 → 160.
    expect(money(s.people[0])).toEqual({
      subtotalCents: 1801,
      discountCents: 0,
      taxCents: 160,
      feeCents: 0,
      tipCents: 360,
      totalCents: 2321,
    });
    expect(s.status).toBe("balanced");
    expect(s.grandTotalCents).toBe(2321);
  });

  it("JPY (0 minor digits): ¥1,000 three ways plus 10% tax", () => {
    // 1000/3 = 333 r1 → A (start 0): 334 / 333 / 333. Tax 10% = 100 (start 1), weights
    // 334/333/333 of 1000: 33.4 (rem 400), 33.3 (rem 300) ×2 → the 1 leftover goes to A.
    const s = computeSplit(
      makeBill({
        currency: "JPY",
        people: [A, B, C],
        items: [makeItem("i0", 1000, { A: 1, B: 1, C: 1 })],
        adjustments: [makeAdjustment("t", "tax", percent(1000))],
      }),
    );
    expect(s.people.map((p) => p.subtotalCents)).toEqual([334, 333, 333]);
    expect(s.people.map((p) => p.taxCents)).toEqual([34, 33, 33]);
    expect(totals(s)).toEqual([368, 366, 366]);
    expect(s.grandTotalCents).toBe(1100);
  });
});

describe("status, printed, payer (§5.6)", () => {
  const items = [makeItem("i0", 2000, { A: 1 }), makeItem("i1", 1000, { B: 1 })];
  const adjustments = [makeAdjustment("t", "tax", percent(1000)), makeAdjustment("p", "tip", percent(2000))];

  it("diffs printed totals; the printed total is compared before tip", () => {
    // S = 3000, T = 300, tip = 600. Subtotal 3000 − 2990 = 10; total (3300) − 3300 = 0.
    const s = computeSplit(makeBill({ people: [A, B], items, adjustments, printed: { subtotalCents: 2990, totalCents: 3300 } }));
    expect(s.printed).toEqual({ subtotalDiffCents: 10, totalDiffCents: 0 });
    expect(computeSplit(makeBill({ people: [A, B], items, printed: { totalCents: 3100 } })).printed).toEqual({
      subtotalDiffCents: null,
      totalDiffCents: -100,
    });
  });

  it("owesTo is the payer for everyone but the payer; settled comes from bill.settled", () => {
    const s = computeSplit(makeBill({ people: [A, B, C], items, paidBy: "B", settled: ["A"] }));
    expect(s.people.map((p) => [p.owesTo, p.settled])).toEqual([
      ["B", true],
      [null, false],
      ["B", false],
    ]);
  });

  it("no payer → owesTo is null everywhere (also for a payer id not on the bill)", () => {
    for (const paidBy of [null, "ghost"]) {
      const s = computeSplit(makeBill({ people: [A, B], items, paidBy }));
      expect(s.people.map((p) => p.owesTo)).toEqual([null, null]);
    }
  });

  it("status: empty / unclaimed / balanced", () => {
    expect(computeSplit(makeBill({ people: [A] })).status).toBe("empty");
    expect(computeSplit(makeBill({ people: [A], items: [makeItem("i0", 0)] })).status).toBe("unclaimed");
    expect(computeSplit(makeBill({ people: [A, B], items })).status).toBe("balanced");
  });
});

describe("previewItemSplit", () => {
  it("is the same allocation computeSplit runs for that item index", () => {
    // 1000 across 1:1:1 from startIndex 2 → C gets the penny.
    expect(previewItemSplit(1000, { A: 1, B: 1, C: 1 }, [A, B, C], 2)).toEqual({ A: 333, B: 333, C: 334 });
    expect(previewItemSplit(1000, { A: 2, B: 1 }, [A, B, C], 0)).toEqual({ A: 667, B: 333 });
    expect(previewItemSplit(1000, {}, [A, B, C], 0)).toEqual({});
    expect(previewItemSplit(1000, { ghost: 1, A: 1 }, [A], 0)).toEqual({ A: 1000 });
  });
});

describe("stability (§5.5)", () => {
  it("claiming an unclaimed item can move someone else's proportional amount by at most 1¢ (leftover penny)", () => {
    // Three 1¢ items: A has i0, B has i1, i2 is unclaimed; a 1¢ proportional tip.
    // Before: weights [1, 1, 1 (unclaimed)], all tie, startIndex 3 → A gets the penny.
    // After B claims i2: weights [1, 2, 0] → B has the largest remainder → B gets it.
    // A's exact share (1 × 1/3) is unchanged; only the leftover penny re-ranks.
    const people = [A, B];
    const bill = (claims: Record<string, number>) =>
      makeBill({
        people,
        items: [makeItem("i0", 1, { A: 1 }), makeItem("i1", 1, { B: 1 }), makeItem("i2", 1, claims)],
        adjustments: [makeAdjustment("p", "tip", amount(1))],
      });
    expect(computeSplit(bill({})).people.map((p) => p.tipCents)).toEqual([1, 0]);
    expect(computeSplit(bill({ B: 1 })).people.map((p) => p.tipCents)).toEqual([0, 1]);
  });
});
