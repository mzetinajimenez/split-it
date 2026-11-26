import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { db, ensureSeeded } from "./db";
import { MAX_CENTS } from "./money";
import * as repo from "./repo";
import {
  addItem,
  addItems,
  addPerson,
  claimRemaining,
  createBill,
  deleteBill,
  explodeItem,
  importBill,
  localToday,
  movePerson,
  NotFoundError,
  removeAdjustment,
  removeItem,
  removePerson,
  renamePerson,
  setClaims,
  setPayer,
  setSettled,
  setTax,
  setTip,
  toggleClaim,
  updateBill,
  updateItem,
  updateSettings,
  upsertAdjustment,
} from "./repo";
import { billSchema } from "./schemas";
import type { Adjustment, Bill, BillSnapshot } from "./types";

const T0 = new Date("2026-11-25T18:00:00.000Z");

/** Advance the (faked) clock so every write gets a distinct `updatedAt`. */
function tick(ms = 1000) {
  vi.setSystemTime(new Date(Date.now() + ms));
}

async function get(id: string): Promise<Bill> {
  const bill = await db.bills.get(id);
  if (!bill) throw new Error(`no bill ${id}`);
  return bill;
}

/** A bill with three people and two items. */
async function fixture() {
  const bill = await createBill({ title: "Tacos" });
  const alex = await addPerson(bill.id, "Alex");
  const blair = await addPerson(bill.id, "Blair");
  const sam = await addPerson(bill.id, "Sam");
  const [tacos, beer] = await addItems(bill.id, [
    { name: "Tacos", priceCents: 1800 },
    { name: "Beer", quantity: 3, priceCents: 2000 },
  ]);
  return { bill, alex, blair, sam, tacos, beer };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  db.close();
  await db.delete();
  await db.open();
  await ensureSeeded();
});

afterEach(() => {
  vi.useRealTimers();
  db.close();
});

describe("spec §4 Repo API surface", () => {
  it("exports every function with the spec's name", () => {
    const names = [
      "createBill", "updateBill", "deleteBill", "importBill",
      "addItem", "addItems", "updateItem", "removeItem", "explodeItem",
      "addPerson", "renamePerson", "removePerson", "movePerson", "setPayer",
      "toggleClaim", "setClaims", "claimRemaining",
      "setTax", "setTip", "upsertAdjustment", "removeAdjustment",
      "setSettled", "updateSettings",
    ];
    for (const name of names) expect(typeof (repo as Record<string, unknown>)[name], name).toBe("function");
  });
});

describe("createBill", () => {
  it("applies the defaults", async () => {
    const bill = await createBill();
    expect(bill).toMatchObject({
      title: "Untitled bill",
      date: localToday(),
      currency: "USD",
      people: [],
      items: [],
      printed: {},
      paidBy: null,
      settled: [],
      deletedAt: null,
      createdAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
    });
    expect(bill.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(bill.adjustments).toEqual([
      { id: expect.any(String), kind: "tip", label: "Tip", value: { type: "percent", bps: 2000 }, basis: "pretax", split: "proportional" },
    ]);
    expect(await get(bill.id)).toEqual(bill);
  });

  it("uses the local date, not the UTC date", () => {
    const late = new Date(2026, 10, 25, 23, 59); // 23:59 local on Nov 25
    expect(localToday(late)).toBe("2026-11-25");
  });

  it("takes the currency and tip from settings", async () => {
    await updateSettings({ currency: "jpy", defaultTip: { bps: 1500, basis: "posttax" } });
    const bill = await createBill();
    expect(bill.currency).toBe("JPY");
    expect(bill.adjustments[0]).toMatchObject({ kind: "tip", value: { type: "percent", bps: 1500 }, basis: "posttax" });
  });

  it("falls back to the default settings if none are seeded", async () => {
    await db.settings.clear();
    const bill = await createBill();
    expect(bill.currency).toBe("USD");
    expect(bill.adjustments[0].value).toEqual({ type: "percent", bps: 2000 });
  });

  it("accepts title, date, currency and notes", async () => {
    const bill = await createBill({ title: "  Tacos  ", date: "2026-11-20", currency: "EUR", notes: "birthday" });
    expect(bill).toMatchObject({ title: "Tacos", date: "2026-11-20", currency: "EUR", notes: "birthday" });
  });

  it.each([
    [{ title: "" }],
    [{ title: "   " }],
    [{ date: "2026-02-30" }],
    [{ date: "11/25/2026" }],
    [{ currency: "dollars" }],
    [{ bogus: 1 } as never],
  ])("rejects bad input %j with a ZodError", async (input) => {
    await expect(createBill(input)).rejects.toBeInstanceOf(ZodError);
    expect(await db.bills.count()).toBe(0);
  });
});

describe("updateBill", () => {
  it("patches fields and stamps updatedAt", async () => {
    const bill = await createBill();
    tick();
    await updateBill(bill.id, { title: "Dinner", printed: { subtotalCents: 3800, totalCents: 4100 } });
    const after = await get(bill.id);
    expect(after).toMatchObject({ title: "Dinner", printed: { subtotalCents: 3800, totalCents: 4100 } });
    expect(after.updatedAt > bill.updatedAt).toBe(true);
    expect(after.createdAt).toBe(bill.createdAt);
  });

  it("replaces `printed` whole", async () => {
    const bill = await createBill();
    await updateBill(bill.id, { printed: { subtotalCents: 100, totalCents: 120 } });
    await updateBill(bill.id, { printed: { totalCents: 130 } });
    expect((await get(bill.id)).printed).toEqual({ totalCents: 130 });
  });

  it("is a no-op (no updatedAt bump) when nothing changes", async () => {
    const bill = await createBill({ title: "Same" });
    tick();
    await updateBill(bill.id, { title: "Same" });
    expect((await get(bill.id)).updatedAt).toBe(bill.updatedAt);
  });

  it("rejects bad input and unknown bills", async () => {
    const bill = await createBill();
    await expect(updateBill(bill.id, { title: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(updateBill(bill.id, { printed: { totalCents: -1 } })).rejects.toBeInstanceOf(ZodError);
    await expect(updateBill(bill.id, { printed: { totalCents: MAX_CENTS + 1 } })).rejects.toBeInstanceOf(ZodError);
    await expect(updateBill("nope", { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteBill", () => {
  it("tombstones: deletedAt is set and the row stays in the table", async () => {
    const bill = await createBill();
    tick();
    await deleteBill(bill.id);
    const row = await get(bill.id);
    expect(row.deletedAt).toBe(new Date(Date.now()).toISOString());
    expect(row.updatedAt).toBe(row.deletedAt);
    expect(await db.bills.count()).toBe(1);
  });

  it("is idempotent, and a deleted bill rejects further writes", async () => {
    const bill = await createBill();
    await deleteBill(bill.id);
    const row = await get(bill.id);
    tick();
    await deleteBill(bill.id);
    expect(await get(bill.id)).toEqual(row);
    await expect(addPerson(bill.id, "Alex")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteBill("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("items", () => {
  it("addItem appends with quantity 1 and no claims", async () => {
    const bill = await createBill();
    tick();
    const item = await addItem(bill.id, { name: " Nachos ", priceCents: 1250 });
    expect(item).toEqual({ id: expect.any(String), name: "Nachos", quantity: 1, priceCents: 1250, claims: {} });
    const after = await get(bill.id);
    expect(after.items).toEqual([item]);
    expect(after.updatedAt > bill.updatedAt).toBe(true);
  });

  it("addItems adds all in order, in one transaction (all or nothing)", async () => {
    const bill = await createBill();
    const items = await addItems(bill.id, [
      { name: "A", priceCents: 100 },
      { name: "B", quantity: 2, priceCents: 200 },
    ]);
    expect((await get(bill.id)).items.map((i) => i.name)).toEqual(["A", "B"]);
    expect(items[1].quantity).toBe(2);
    await expect(
      addItems(bill.id, [{ name: "C", priceCents: 1 }, { name: "", priceCents: 1 }]),
    ).rejects.toBeInstanceOf(ZodError);
    expect((await get(bill.id)).items).toHaveLength(2);
  });

  it.each([
    ["an empty name", { name: "", priceCents: 100 }],
    ["a blank name", { name: "   ", priceCents: 100 }],
    ["a name over 80 chars", { name: "x".repeat(81), priceCents: 100 }],
    ["a negative price", { name: "A", priceCents: -1 }],
    ["a fractional price", { name: "A", priceCents: 12.5 }],
    ["a price over MAX_CENTS", { name: "A", priceCents: MAX_CENTS + 1 }],
    ["a non-integer quantity", { name: "A", quantity: 1.5, priceCents: 100 }],
    ["a zero quantity", { name: "A", quantity: 0, priceCents: 100 }],
  ])("addItem rejects %s with a ZodError", async (_, input) => {
    const bill = await createBill();
    await expect(addItem(bill.id, input)).rejects.toBeInstanceOf(ZodError);
    expect((await get(bill.id)).items).toEqual([]);
  });

  it("caps the bill's items subtotal at MAX_CENTS", async () => {
    const bill = await createBill();
    await addItem(bill.id, { name: "A", priceCents: 60_000_000 });
    await expect(addItem(bill.id, { name: "B", priceCents: 40_000_000 })).rejects.toBeInstanceOf(ZodError);
    expect((await get(bill.id)).items).toHaveLength(1);
  });

  it("updateItem patches name, quantity and price and keeps claims", async () => {
    const { bill, alex, tacos } = await fixture();
    await toggleClaim(bill.id, tacos.id, alex.id);
    await updateItem(bill.id, tacos.id, { name: "Fish tacos", quantity: 2, priceCents: 2400 });
    expect((await get(bill.id)).items[0]).toEqual({
      id: tacos.id,
      name: "Fish tacos",
      quantity: 2,
      priceCents: 2400,
      claims: { [alex.id]: 1 },
    });
    await expect(updateItem(bill.id, tacos.id, { priceCents: -5 })).rejects.toBeInstanceOf(ZodError);
    await expect(updateItem(bill.id, "nope", { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removeItem is an array removal that bumps updatedAt", async () => {
    const { bill, tacos, beer } = await fixture();
    const before = await get(bill.id);
    tick();
    await removeItem(bill.id, tacos.id);
    const after = await get(bill.id);
    expect(after.items.map((i) => i.id)).toEqual([beer.id]);
    expect(after.updatedAt > before.updatedAt).toBe(true);
    tick();
    await removeItem(bill.id, tacos.id); // already gone: no-op
    expect((await get(bill.id)).updatedAt).toBe(after.updatedAt);
  });
});

describe("explodeItem", () => {
  it("qty 3 / $20.00 → 667, 667, 666 named (i/3), claims cleared, in the original's place", async () => {
    const { bill, alex, tacos, beer } = await fixture();
    const last = await addItem(bill.id, { name: "Flan", priceCents: 600 });
    await toggleClaim(bill.id, beer.id, alex.id);
    const parts = await explodeItem(bill.id, beer.id);
    expect(parts.map((p) => p.priceCents)).toEqual([667, 667, 666]);
    expect(parts.map((p) => p.name)).toEqual(["Beer (1/3)", "Beer (2/3)", "Beer (3/3)"]);
    expect(parts.every((p) => p.quantity === 1 && Object.keys(p.claims).length === 0)).toBe(true);
    expect(new Set(parts.map((p) => p.id)).size).toBe(3);
    expect(parts.some((p) => p.id === beer.id)).toBe(false);
    const items = (await get(bill.id)).items;
    expect(items.map((i) => i.id)).toEqual([tacos.id, ...parts.map((p) => p.id), last.id]);
    expect(items.reduce((s, i) => s + i.priceCents, 0)).toBe(1800 + 2000 + 600);
  });

  it("returns a qty-1 item unchanged", async () => {
    const { bill, tacos } = await fixture();
    const before = await get(bill.id);
    expect(await explodeItem(bill.id, tacos.id)).toEqual([before.items[0]]);
    expect(await get(bill.id)).toEqual(before);
  });

  it("keeps exploded names within 80 chars", async () => {
    const bill = await createBill();
    const item = await addItem(bill.id, { name: "x".repeat(80), quantity: 12, priceCents: 1000 });
    const parts = await explodeItem(bill.id, item.id);
    expect(parts).toHaveLength(12);
    expect(parts.every((p) => p.name.length <= 80)).toBe(true);
    expect(parts[11].name.endsWith(" (12/12)")).toBe(true);
    expect(parts.reduce((s, p) => s + p.priceCents, 0)).toBe(1000);
  });

  it("rejects an unknown item", async () => {
    const bill = await createBill();
    await expect(explodeItem(bill.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("people", () => {
  it("addPerson trims the name and takes the lowest unused colour", async () => {
    const bill = await createBill();
    const a = await addPerson(bill.id, "  Alex ");
    const b = await addPerson(bill.id, "Blair");
    expect(a).toEqual({ id: expect.any(String), name: "Alex", colorIndex: 0 });
    expect(b.colorIndex).toBe(1);
    await removePerson(bill.id, a.id);
    expect((await addPerson(bill.id, "Cam")).colorIndex).toBe(0);
  });

  it("wraps colours after 8", async () => {
    const bill = await createBill();
    const people = [];
    for (let i = 0; i < 10; i++) people.push(await addPerson(bill.id, `P${i}`));
    expect(people.map((p) => p.colorIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
  });

  it.each(["", "   ", "x".repeat(41)])("addPerson rejects the name %j", async (name) => {
    const bill = await createBill();
    await expect(addPerson(bill.id, name)).rejects.toBeInstanceOf(ZodError);
  });

  it("renamePerson", async () => {
    const { bill, alex } = await fixture();
    await renamePerson(bill.id, alex.id, "Alexis");
    expect((await get(bill.id)).people[0].name).toBe("Alexis");
    await expect(renamePerson(bill.id, alex.id, "")).rejects.toBeInstanceOf(ZodError);
    await expect(renamePerson(bill.id, "nope", "X")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removePerson strips their claims from every item, clears paidBy and settled", async () => {
    const { bill, alex, blair, tacos, beer } = await fixture();
    await setClaims(bill.id, tacos.id, { [alex.id]: 1, [blair.id]: 2 });
    await setClaims(bill.id, beer.id, { [alex.id]: 1 });
    await setPayer(bill.id, alex.id);
    await setSettled(bill.id, alex.id, true);
    await setSettled(bill.id, blair.id, true);
    tick();
    await removePerson(bill.id, alex.id);
    const after = await get(bill.id);
    expect(after.people.map((p) => p.id)).not.toContain(alex.id);
    expect(after.items[0].claims).toEqual({ [blair.id]: 2 });
    expect(after.items[1].claims).toEqual({}); // unclaimed again
    expect(after.paidBy).toBeNull();
    expect(after.settled).toEqual([blair.id]);
    expect(after.updatedAt > bill.updatedAt).toBe(true);
  });

  it("removePerson keeps a different payer", async () => {
    const { bill, alex, blair } = await fixture();
    await setPayer(bill.id, blair.id);
    await removePerson(bill.id, alex.id);
    expect((await get(bill.id)).paidBy).toBe(blair.id);
  });

  it("movePerson reorders and clamps", async () => {
    const { bill, alex, blair, sam } = await fixture();
    await movePerson(bill.id, sam.id, 0);
    expect((await get(bill.id)).people.map((p) => p.id)).toEqual([sam.id, alex.id, blair.id]);
    await movePerson(bill.id, sam.id, 99);
    expect((await get(bill.id)).people.map((p) => p.id)).toEqual([alex.id, blair.id, sam.id]);
    await movePerson(bill.id, blair.id, -3);
    expect((await get(bill.id)).people.map((p) => p.id)).toEqual([blair.id, alex.id, sam.id]);
    await expect(movePerson(bill.id, blair.id, 1.5)).rejects.toBeInstanceOf(ZodError);
    await expect(movePerson(bill.id, "nope", 0)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("setPayer sets and clears, and rejects someone not on the bill", async () => {
    const { bill, sam } = await fixture();
    await setPayer(bill.id, sam.id);
    expect((await get(bill.id)).paidBy).toBe(sam.id);
    await setPayer(bill.id, null);
    expect((await get(bill.id)).paidBy).toBeNull();
    await expect(setPayer(bill.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("claims", () => {
  it("toggleClaim flips between absent and 1", async () => {
    const { bill, alex, tacos } = await fixture();
    await toggleClaim(bill.id, tacos.id, alex.id);
    expect((await get(bill.id)).items[0].claims).toEqual({ [alex.id]: 1 });
    await toggleClaim(bill.id, tacos.id, alex.id);
    expect((await get(bill.id)).items[0].claims).toEqual({});
  });

  it("toggleClaim un-claims a weighted claim", async () => {
    const { bill, alex, tacos } = await fixture();
    await setClaims(bill.id, tacos.id, { [alex.id]: 3 });
    await toggleClaim(bill.id, tacos.id, alex.id);
    expect((await get(bill.id)).items[0].claims).toEqual({});
  });

  it("toggleClaim rejects unknown items and people", async () => {
    const { bill, alex, tacos } = await fixture();
    await expect(toggleClaim(bill.id, "nope", alex.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(toggleClaim(bill.id, tacos.id, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("two concurrent toggleClaims on different people both persist", async () => {
    const { bill, alex, blair, sam, tacos } = await fixture();
    await Promise.all([
      toggleClaim(bill.id, tacos.id, alex.id),
      toggleClaim(bill.id, tacos.id, blair.id),
      toggleClaim(bill.id, tacos.id, sam.id),
    ]);
    expect((await get(bill.id)).items[0].claims).toEqual({ [alex.id]: 1, [blair.id]: 1, [sam.id]: 1 });
  });

  it("setClaims replaces the map and drops zero/negative entries", async () => {
    const { bill, alex, blair, sam, tacos } = await fixture();
    await toggleClaim(bill.id, tacos.id, sam.id);
    await setClaims(bill.id, tacos.id, { [alex.id]: 2, [blair.id]: 0, [sam.id]: -1 });
    expect((await get(bill.id)).items[0].claims).toEqual({ [alex.id]: 2 });
    await setClaims(bill.id, tacos.id, {});
    expect((await get(bill.id)).items[0].claims).toEqual({});
  });

  it("setClaims rejects shares over 99, non-integers and unknown person ids", async () => {
    const { bill, alex, tacos } = await fixture();
    await expect(setClaims(bill.id, tacos.id, { [alex.id]: 100 })).rejects.toBeInstanceOf(ZodError);
    await expect(setClaims(bill.id, tacos.id, { [alex.id]: 1.5 })).rejects.toBeInstanceOf(ZodError);
    await expect(setClaims(bill.id, tacos.id, { stranger: 1 })).rejects.toBeInstanceOf(ZodError);
    await expect(setClaims(bill.id, "nope", { [alex.id]: 1 })).rejects.toBeInstanceOf(NotFoundError);
    expect((await get(bill.id)).items[0].claims).toEqual({});
    await setClaims(bill.id, tacos.id, { [alex.id]: 99 });
    expect((await get(bill.id)).items[0].claims).toEqual({ [alex.id]: 99 });
  });

  it("claimRemaining touches only items with {} claims", async () => {
    const { bill, alex, blair, sam, tacos, beer } = await fixture();
    const flan = await addItem(bill.id, { name: "Flan", priceCents: 600 });
    await setClaims(bill.id, tacos.id, { [sam.id]: 2 });
    await claimRemaining(bill.id, [alex.id, blair.id, alex.id]);
    const items = (await get(bill.id)).items;
    expect(items[0].claims).toEqual({ [sam.id]: 2 });
    expect(items[1]).toMatchObject({ id: beer.id, claims: { [alex.id]: 1, [blair.id]: 1 } });
    expect(items[2]).toMatchObject({ id: flan.id, claims: { [alex.id]: 1, [blair.id]: 1 } });
    await expect(claimRemaining(bill.id, [])).rejects.toBeInstanceOf(ZodError);
    await expect(claimRemaining(bill.id, ["nope"])).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("adjustments", () => {
  it("setTax adds one tax, replaces it in place, and removes it with null", async () => {
    const bill = await createBill();
    await setTax(bill.id, { type: "percent", bps: 825 });
    let adjs = (await get(bill.id)).adjustments;
    expect(adjs.map((a) => a.kind)).toEqual(["tip", "tax"]);
    const tax = adjs[1];
    expect(tax).toEqual({ id: expect.any(String), kind: "tax", label: "Tax", value: { type: "percent", bps: 825 }, split: "proportional" });
    await setTax(bill.id, { type: "amount", cents: 312 });
    adjs = (await get(bill.id)).adjustments;
    expect(adjs.filter((a) => a.kind === "tax")).toEqual([{ ...tax, value: { type: "amount", cents: 312 } }]);
    await setTax(bill.id, null);
    expect((await get(bill.id)).adjustments.map((a) => a.kind)).toEqual(["tip"]);
    await expect(setTax(bill.id, { type: "percent", bps: 10_001 })).rejects.toBeInstanceOf(ZodError);
    await expect(setTax(bill.id, { type: "amount", cents: -1 })).rejects.toBeInstanceOf(ZodError);
  });

  it("setTip keeps at most one tip, preserving its id", async () => {
    const bill = await createBill();
    const tipId = bill.adjustments[0].id;
    await setTip(bill.id, { value: { type: "amount", cents: 500 }, basis: "posttax", split: "equal" });
    expect((await get(bill.id)).adjustments).toEqual([
      { id: tipId, kind: "tip", label: "Tip", value: { type: "amount", cents: 500 }, basis: "posttax", split: "equal" },
    ]);
    await setTip(bill.id, null);
    expect((await get(bill.id)).adjustments).toEqual([]);
    await setTip(bill.id, { value: { type: "percent", bps: 1800 }, basis: "pretax", split: "proportional" });
    const adjs = (await get(bill.id)).adjustments;
    expect(adjs).toHaveLength(1);
    expect(adjs[0]).toMatchObject({ kind: "tip", value: { type: "percent", bps: 1800 } });
  });

  it("upsertAdjustment adds and replaces fees and discounts", async () => {
    const bill = await createBill();
    const fee = await upsertAdjustment(bill.id, {
      kind: "fee",
      label: "Service charge",
      value: { type: "percent", bps: 1800 },
      split: "proportional",
    });
    const disc = await upsertAdjustment(bill.id, {
      kind: "discount",
      label: "Happy hour",
      value: { type: "amount", cents: 500 },
      split: "equal",
    });
    expect((await get(bill.id)).adjustments.map((a) => a.kind)).toEqual(["tip", "fee", "discount"]);
    const updated = await upsertAdjustment(bill.id, { ...fee, label: "Corkage", value: { type: "amount", cents: 1500 } });
    expect(updated.id).toBe(fee.id);
    expect((await get(bill.id)).adjustments.slice(1)).toEqual([updated, disc]);
  });

  it("upsertAdjustment accepts only fee / discount", async () => {
    const bill = await createBill();
    const tip = bill.adjustments[0];
    for (const kind of ["tax", "tip"] as const) {
      await expect(
        upsertAdjustment(bill.id, { kind, label: "X", value: { type: "amount", cents: 1 }, split: "proportional" }),
      ).rejects.toBeInstanceOf(ZodError);
    }
    // Can't turn the tip into a fee by id, or upsert a stale id.
    await expect(
      upsertAdjustment(bill.id, { id: tip.id, kind: "fee", label: "X", value: { type: "amount", cents: 1 }, split: "proportional" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      upsertAdjustment(bill.id, { id: "gone", kind: "fee", label: "X", value: { type: "amount", cents: 1 }, split: "proportional" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      upsertAdjustment(bill.id, { kind: "fee", label: "", value: { type: "amount", cents: 1 }, split: "proportional" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      upsertAdjustment(bill.id, { kind: "fee", label: "X", basis: "pretax", value: { type: "amount", cents: 1 }, split: "proportional" }),
    ).rejects.toBeInstanceOf(ZodError);
    expect((await get(bill.id)).adjustments).toEqual([tip]);
  });

  it("removeAdjustment removes any kind by id and bumps updatedAt", async () => {
    const bill = await createBill();
    tick();
    await removeAdjustment(bill.id, bill.adjustments[0].id);
    const after = await get(bill.id);
    expect(after.adjustments).toEqual([]);
    expect(after.updatedAt > bill.updatedAt).toBe(true);
  });

  it("rejects adjustments too large to split exactly (allocate stays under 2^53)", async () => {
    const bill = await createBill();
    // S × S alone must fit: a single MAX_CENTS item is over the bound (~9.999e15 > 2^53).
    await expect(addItem(bill.id, { name: "A", priceCents: MAX_CENTS })).rejects.toBeInstanceOf(ZodError);
    await addItem(bill.id, { name: "A", priceCents: 94_000_000 }); // 8.8e15: fits
    // A fixed fee of MAX_CENTS would allocate ~1e8 over weights summing to 9.4e7 → 9.4e15.
    await expect(
      upsertAdjustment(bill.id, { kind: "fee", label: "Corkage", value: { type: "amount", cents: MAX_CENTS }, split: "proportional" }),
    ).rejects.toBeInstanceOf(ZodError);
    // A post-tax percent tip is bounded by S + tax + fees.
    await upsertAdjustment(bill.id, { kind: "fee", label: "Corkage", value: { type: "amount", cents: 5_000_000 }, split: "proportional" });
    await expect(
      setTip(bill.id, { value: { type: "percent", bps: 2000 }, basis: "posttax", split: "proportional" }),
    ).rejects.toBeInstanceOf(ZodError);
    await setTip(bill.id, { value: { type: "percent", bps: 2000 }, basis: "pretax", split: "proportional" });
  });

  it("allows a realistic large bill", async () => {
    const bill = await createBill();
    await addItem(bill.id, { name: "Banquet", priceCents: 5_000_000 }); // $50,000
    await setTax(bill.id, { type: "percent", bps: 1000 });
    await setTip(bill.id, { value: { type: "percent", bps: 2500 }, basis: "posttax", split: "proportional" });
    await upsertAdjustment(bill.id, { kind: "fee", label: "Venue", value: { type: "amount", cents: 1_000_000 }, split: "equal" });
    expect((await get(bill.id)).adjustments).toHaveLength(3);
  });
});

describe("settlement and settings", () => {
  it("setSettled adds and removes, idempotently", async () => {
    const { bill, alex, blair } = await fixture();
    await setSettled(bill.id, alex.id, true);
    await setSettled(bill.id, blair.id, true);
    const settled = await get(bill.id);
    tick();
    await setSettled(bill.id, alex.id, true);
    expect(await get(bill.id)).toEqual(settled);
    await setSettled(bill.id, alex.id, false);
    expect((await get(bill.id)).settled).toEqual([blair.id]);
    await expect(setSettled(bill.id, "nope", true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updateSettings patches and stamps updatedAt", async () => {
    tick();
    await updateSettings({ currency: "eur" });
    const s = await db.settings.get("settings");
    expect(s).toMatchObject({ currency: "EUR", defaultTip: { bps: 2000, basis: "pretax" }, updatedAt: new Date(Date.now()).toISOString() });
    await updateSettings({ defaultTip: { bps: 1800, basis: "posttax" } });
    expect((await db.settings.get("settings"))!.defaultTip).toEqual({ bps: 1800, basis: "posttax" });
  });

  it.each([
    [{ currency: "XX" }],
    [{ defaultTip: { bps: 20.5, basis: "pretax" as const } }],
    [{ defaultTip: { bps: 2000, basis: "sideways" as never } }],
    [{ id: "other" } as never],
  ])("updateSettings rejects %j", async (patch) => {
    await expect(updateSettings(patch)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("importBill", () => {
  const snapshot: BillSnapshot = {
    title: "Shared tacos",
    date: "2026-11-24",
    currency: "USD",
    people: [
      { id: "0", name: "Alex", colorIndex: 0 },
      { id: "1", name: "Blair", colorIndex: 1 },
    ],
    items: [
      { id: "0", name: "Tacos", quantity: 1, priceCents: 1800, claims: { "0": 1, "1": 2 } },
      { id: "1", name: "Beer", quantity: 2, priceCents: 1200, claims: { "1": 1 } },
      { id: "2", name: "Flan", quantity: 1, priceCents: 600, claims: {} },
    ],
    adjustments: [
      { id: "0", kind: "tax", label: "Tax", value: { type: "percent", bps: 825 }, split: "proportional" },
      { id: "1", kind: "tip", label: "Tip", value: { type: "percent", bps: 2000 }, basis: "pretax", split: "proportional" },
    ],
    printed: { subtotalCents: 3600 },
    paidBy: "1",
    settled: ["0"],
    notes: "from a link",
  };

  it("assigns fresh UUIDs and remaps claims, paidBy and settled", async () => {
    const bill = await importBill(snapshot);
    expect(await get(bill.id)).toEqual(bill);
    expect(billSchema.safeParse(bill).success).toBe(true);
    const ids = [bill.id, ...bill.people.map((p) => p.id), ...bill.items.map((i) => i.id), ...bill.adjustments.map((a) => a.id)];
    expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const [alex, blair] = bill.people;
    expect(bill.people.map((p) => [p.name, p.colorIndex])).toEqual([["Alex", 0], ["Blair", 1]]);
    expect(bill.items.map((i) => i.claims)).toEqual([{ [alex.id]: 1, [blair.id]: 2 }, { [blair.id]: 1 }, {}]);
    expect(bill.paidBy).toBe(blair.id);
    expect(bill.settled).toEqual([alex.id]);
    expect(bill).toMatchObject({
      title: "Shared tacos",
      date: "2026-11-24",
      printed: { subtotalCents: 3600 },
      notes: "from a link",
      deletedAt: null,
      createdAt: T0.toISOString(),
    });
    const noId = (a: Adjustment) => ({ ...a, id: "" });
    expect(bill.adjustments.map(noId)).toEqual(snapshot.adjustments.map(noId));
  });

  it("round-trips: re-importing a stored bill gives an equal bill with new ids", async () => {
    const first = await importBill(snapshot);
    const snap: Partial<Bill> = { ...first };
    for (const key of ["id", "createdAt", "updatedAt", "deletedAt"] as const) delete snap[key];
    const second = await importBill(snap as BillSnapshot);
    expect(second.id).not.toBe(first.id);
    const strip = (b: Bill) => ({
      ...b,
      id: "",
      people: b.people.map((p, i) => ({ ...p, id: String(i) })),
      items: b.items.map((it, i) => ({
        ...it,
        id: String(i),
        claims: Object.fromEntries(Object.entries(it.claims).map(([pid, s]) => [String(b.people.findIndex((p) => p.id === pid)), s])),
      })),
      adjustments: b.adjustments.map((a, i) => ({ ...a, id: String(i) })),
      paidBy: String(b.people.findIndex((p) => p.id === b.paidBy)),
      settled: b.settled.map((pid) => String(b.people.findIndex((p) => p.id === pid))),
    });
    expect(strip(second)).toEqual(strip(first));
    expect(await db.bills.count()).toBe(2);
  });

  it.each([
    ["a claim by an unknown person", { items: [{ id: "0", name: "A", quantity: 1, priceCents: 1, claims: { "9": 1 } }] }],
    ["an unknown payer", { paidBy: "9" }],
    ["two taxes", {
      adjustments: [
        { id: "0", kind: "tax", label: "Tax", value: { type: "percent", bps: 825 }, split: "proportional" },
        { id: "1", kind: "tax", label: "Tax 2", value: { type: "percent", bps: 100 }, split: "proportional" },
      ],
    }],
    ["duplicate person ids", { people: [{ id: "0", name: "A", colorIndex: 0 }, { id: "0", name: "B", colorIndex: 1 }], settled: [], paidBy: null, items: [] }],
    ["sync fields", { id: "x" }],
    ["a basis on a fee", { adjustments: [{ id: "0", kind: "fee", label: "F", value: { type: "amount", cents: 1 }, basis: "pretax", split: "equal" }] }],
  ])("rejects a snapshot with %s", async (_, patch) => {
    await expect(importBill({ ...snapshot, ...patch } as BillSnapshot)).rejects.toBeInstanceOf(ZodError);
    expect(await db.bills.count()).toBe(0);
  });
});
