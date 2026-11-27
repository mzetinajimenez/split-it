import { describe, expect, it } from "vitest";
import { computeSplit } from "./split";
import { makeBill, makeItem, makePerson } from "./testing/billFactory";
import { payerOwedCents } from "./payerOwed";

describe("payerOwedCents", () => {
  it("is Σ everyone else's totals", () => {
    const bill = makeBill({
      people: [makePerson("a"), makePerson("b"), makePerson("c")],
      items: [makeItem("i1", 1000, { a: 1, b: 1 }), makeItem("i2", 500, { c: 1 })],
      paidBy: "a",
    });
    const split = computeSplit(bill);
    const others = split.people.filter((p) => p.personId !== "a").reduce((s, p) => s + p.totalCents, 0);
    expect(payerOwedCents(split, "a")).toBe(others);
    expect(payerOwedCents(split, "a")).toBe(1000);
  });
});
