import { describe, expect, it } from "vitest";
import { computeSplit } from "./split";
import { summaryText } from "./summaryText";
import { makeBill, makeItem, makePerson } from "./testing/billFactory";
import type { Bill } from "./types";

const people = [makePerson("a", { name: "Alex" }), makePerson("b", { name: "Blair" }), makePerson("s", { name: "Sam" })];

function tacos(overrides: Partial<Bill> = {}): Bill {
  return makeBill({
    title: "Tacos",
    date: "2026-11-25",
    people,
    items: [makeItem("1", 3820, { a: 1 }), makeItem("2", 4115, { b: 1 }), makeItem("3", 6345, { s: 1 })],
    ...overrides,
  });
}

const text = (bill: Bill, locale?: string) => summaryText(bill, computeSplit(bill), locale ? { locale } : undefined);

describe("summaryText", () => {
  it("matches the spec §7 layout with a payer", () => {
    expect(text(tacos({ paidBy: "s" }))).toBe(
      ["Tacos — Nov 25 · $142.80", "Alex owes Sam $38.20", "Blair owes Sam $41.15", "Sam paid · their share $63.45"].join("\n"),
    );
  });

  it("lists the payer last even when they are first on the bill", () => {
    const bill = tacos({ paidBy: "a" });
    expect(text(bill).split("\n")).toEqual([
      "Tacos — Nov 25 · $142.80",
      "Blair owes Alex $41.15",
      "Sam owes Alex $63.45",
      "Alex paid · their share $38.20",
    ]);
  });

  it("without a payer, says what each person owes", () => {
    expect(text(tacos())).toBe(
      ["Tacos — Nov 25 · $142.80", "Alex owes $38.20", "Blair owes $41.15", "Sam owes $63.45"].join("\n"),
    );
  });

  it("marks people who have paid back", () => {
    expect(text(tacos({ paidBy: "s", settled: ["b"] })).split("\n")[2]).toBe("Blair owes Sam $41.15 (paid back)");
  });

  it("says so when items are unclaimed", () => {
    const bill = tacos({
      paidBy: "s",
      items: [makeItem("1", 3820, { a: 1 }), makeItem("2", 4115, {}), makeItem("3", 6345, {})],
    });
    const lines = text(bill).split("\n");
    expect(lines[0]).toBe("Tacos — Nov 25 · $142.80");
    expect(lines.at(-1)).toBe("Unclaimed: 2 items · $104.60");
    expect(text(tacos({ items: [makeItem("1", 500, {})] })).split("\n").at(-1)).toBe("Unclaimed: 1 item · $5.00");
  });

  it("omits the unclaimed line when everything is claimed", () => {
    expect(text(tacos())).not.toMatch(/Unclaimed/);
  });

  it("formats JPY without minor units", () => {
    const bill = makeBill({
      title: "Ramen",
      date: "2026-01-03",
      currency: "JPY",
      people: [makePerson("a", { name: "Aiko" }), makePerson("k", { name: "Kenji" })],
      items: [makeItem("1", 1200, { a: 1 }), makeItem("2", 980, { k: 1 })],
      paidBy: "k",
    });
    expect(text(bill)).toBe(["Ramen — Jan 3 · ¥2,180", "Aiko owes Kenji ¥1,200", "Kenji paid · their share ¥980"].join("\n"));
  });

  it("uses the locale for the date and does not shift it across time zones", () => {
    expect(text(tacos({ date: "2026-12-31" })).split("\n")[0]).toBe("Tacos — Dec 31 · $142.80");
    expect(text(tacos({ date: "2026-11-25" }), "de-DE").split("\n")[0]).toBe("Tacos — 25. Nov. · $142.80");
  });

  it("an empty bill is just the header", () => {
    expect(text(makeBill({ title: "Lunch", date: "2026-11-25" }))).toBe("Lunch — Nov 25 · $0.00");
  });
});
