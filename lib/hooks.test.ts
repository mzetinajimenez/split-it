import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, DEFAULT_SETTINGS } from "./db";
import {
  initDb,
  queryBill,
  queryBills,
  queryRecentPeople,
  querySettings,
  querySplit,
  RECENT_PEOPLE_BILLS,
  resetDbInitForTests,
} from "./hooks";
import { addPerson, createBill, deleteBill, setTip, toggleClaim, addItem, updateSettings } from "./repo";
import { computeSplit } from "./split";
import { makeBill, makeItem, makePerson, makeAdjustment, percent } from "./testing/billFactory";
import type { Bill } from "./types";

async function reset() {
  db.close();
  await db.delete();
  await db.open();
  resetDbInitForTests();
}

beforeEach(reset);
afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
});

const put = (...bills: Bill[]) => db.bills.bulkPut(bills);

describe("queryBills", () => {
  it("is empty on a fresh database", async () => {
    expect(await queryBills()).toEqual([]);
  });

  it("filters tombstones", async () => {
    await put(makeBill({ id: "a" }), makeBill({ id: "b", deletedAt: "2026-11-25T13:00:00.000Z" }));
    expect((await queryBills()).map((e) => e.bill.id)).toEqual(["a"]);
  });

  it("sorts by date desc, then updatedAt desc", async () => {
    await put(
      makeBill({ id: "old", date: "2026-10-01", updatedAt: "2026-11-25T23:00:00.000Z" }),
      makeBill({ id: "new-early", date: "2026-11-20", updatedAt: "2026-11-20T10:00:00.000Z" }),
      makeBill({ id: "new-late", date: "2026-11-20", updatedAt: "2026-11-21T10:00:00.000Z" }),
      makeBill({ id: "newest", date: "2026-11-25", updatedAt: "2026-11-01T00:00:00.000Z" }),
    );
    expect((await queryBills()).map((e) => e.bill.id)).toEqual(["newest", "new-late", "new-early", "old"]);
  });

  it("derives totalCents, unclaimedCount, settledCount and status from computeSplit", async () => {
    const bill = makeBill({
      id: "b",
      people: [makePerson("p1"), makePerson("p2"), makePerson("p3")],
      items: [makeItem("i1", 1000, { p1: 1 }), makeItem("i2", 500), makeItem("i3", 250)],
      adjustments: [makeAdjustment("t", "tip", percent(2000))],
      paidBy: "p1",
      settled: ["p2"],
    });
    await put(bill);
    const [entry] = await queryBills();
    const split = computeSplit(bill);
    expect(entry).toEqual({
      bill,
      totalCents: split.grandTotalCents,
      unclaimedCount: 2,
      settledCount: 1,
      status: "unclaimed",
    });
    expect(entry.totalCents).toBe(2100);
  });

  it("reports empty and balanced bills", async () => {
    await put(
      makeBill({ id: "empty", date: "2026-11-02" }),
      makeBill({ id: "balanced", date: "2026-11-01", people: [makePerson("p")], items: [makeItem("i", 100, { p: 1 })] }),
    );
    const entries = await queryBills();
    expect(entries.map((e) => [e.bill.id, e.status, e.unclaimedCount])).toEqual([
      ["empty", "empty", 0],
      ["balanced", "balanced", 0],
    ]);
  });
});

describe("queryBill / querySplit", () => {
  it("returns the bill, or null when missing", async () => {
    const bill = makeBill({ id: "x" });
    await put(bill);
    expect(await queryBill("x")).toEqual(bill);
    expect(await queryBill("nope")).toBeNull();
  });

  it("returns null for a tombstoned bill (deleted through the repo)", async () => {
    const bill = await createBill({ title: "Tacos" });
    expect(await queryBill(bill.id)).not.toBeNull();
    await deleteBill(bill.id);
    expect(await db.bills.get(bill.id)).toBeDefined(); // the row is still there…
    expect(await queryBill(bill.id)).toBeNull(); // …but reads never see it
    expect(await querySplit(bill.id)).toBeNull();
    expect(await queryBills()).toEqual([]);
  });

  it("querySplit pairs the bill with computeSplit and tracks repo writes", async () => {
    const bill = await createBill();
    const alex = await addPerson(bill.id, "Alex");
    const item = await addItem(bill.id, { name: "Fries", priceCents: 600 });

    let result = await querySplit(bill.id);
    expect(result!.split).toEqual(computeSplit(result!.bill));
    expect(result!.split.status).toBe("unclaimed");

    await toggleClaim(bill.id, item.id, alex.id);
    result = await querySplit(bill.id);
    expect(result!.split.status).toBe("balanced");
    const before = result!.split.grandTotalCents;

    await setTip(bill.id, { value: percent(1000), basis: "pretax", split: "proportional" });
    result = await querySplit(bill.id);
    expect(result!.split.grandTotalCents).not.toBe(before);
    expect(result!.split).toEqual(computeSplit(result!.bill));
  });
});

describe("queryRecentPeople", () => {
  const people = (...names: string[]) => names.map((name, i) => makePerson(`p${i}`, { name }));

  it("is empty with no bills", async () => {
    expect(await queryRecentPeople()).toEqual([]);
  });

  it("returns distinct names, most recent bill first, in each bill's people order", async () => {
    await put(
      makeBill({ id: "old", date: "2026-11-01", people: people("Casey", "Alex") }),
      makeBill({ id: "new", date: "2026-11-20", people: people("Blair", "Alex") }),
    );
    expect(await queryRecentPeople()).toEqual(["Blair", "Alex", "Casey"]);
  });

  it("dedupes case-insensitively, keeping the most recent casing", async () => {
    await put(
      makeBill({ id: "old", date: "2026-11-01", people: people("alex", "BLAIR") }),
      makeBill({ id: "new", date: "2026-11-20", people: people("Alex") }),
      makeBill({ id: "mid", date: "2026-11-10", people: people("Blair") }),
    );
    expect(await queryRecentPeople()).toEqual(["Alex", "Blair"]);
  });

  it("ignores tombstoned bills", async () => {
    await put(
      makeBill({ id: "live", people: people("Alex") }),
      makeBill({ id: "dead", date: "2026-12-01", deletedAt: "2026-12-01T00:00:00.000Z", people: people("Ghost") }),
    );
    expect(await queryRecentPeople()).toEqual(["Alex"]);
  });

  it("looks only at the newest 20 bills", async () => {
    const bills = Array.from({ length: RECENT_PEOPLE_BILLS + 1 }, (_, i) =>
      makeBill({
        id: `b${i}`,
        date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
        people: people(`Person ${i}`),
      }),
    );
    await put(...bills);
    const names = await queryRecentPeople(100);
    expect(RECENT_PEOPLE_BILLS).toBe(20);
    expect(names).toHaveLength(20);
    expect(names[0]).toBe("Person 20");
    expect(names).not.toContain("Person 0"); // the oldest, 21st bill
  });

  it("respects the limit (default 12)", async () => {
    await put(makeBill({ people: people(...Array.from({ length: 15 }, (_, i) => `N${i}`)) }));
    expect(await queryRecentPeople()).toHaveLength(12);
    expect(await queryRecentPeople(3)).toEqual(["N0", "N1", "N2"]);
    expect(await queryRecentPeople(0)).toEqual([]);
  });
});

describe("querySettings", () => {
  it("falls back to the defaults before seeding", async () => {
    expect(await querySettings()).toMatchObject(DEFAULT_SETTINGS);
  });

  it("returns the stored row after seeding and updates", async () => {
    await initDb();
    await updateSettings({ currency: "EUR" });
    expect(await querySettings()).toMatchObject({ id: "settings", currency: "EUR", defaultTip: { bps: 2000, basis: "pretax" } });
  });
});

describe("initDb", () => {
  it("seeds meta and settings and requests persistent storage, once", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist } });
    await Promise.all([initDb(), initDb()]);
    await initDb();
    expect(await db.meta.count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("treats persist() as best-effort: a rejection or missing API doesn't fail init", async () => {
    vi.stubGlobal("navigator", { storage: { persist: vi.fn().mockRejectedValue(new Error("nope")) } });
    await expect(initDb()).resolves.toBeUndefined();
    resetDbInitForTests();
    vi.stubGlobal("navigator", {});
    await expect(initDb()).resolves.toBeUndefined();
    expect(await db.meta.count()).toBe(1);
  });
});
