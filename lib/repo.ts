// lib/repo.ts: THE WRITE PATH (spec §4 "Repo API"). Every UI mutation goes through these
// functions, and nothing else writes to the database.
//
// Each function:
// - zod-validates its arguments (a bad argument rejects with a ZodError before any IO);
// - for a bill, runs ONE read-modify-write inside `db.transaction("rw", db.bills, …)`, so
//   concurrent writes to the same bill serialise and none is lost;
// - re-validates the whole resulting bill against `billSchema` before writing it, so
//   cross-field rules (claims reference people on the bill, ≤ 1 tax/tip, the subtotal cap)
//   hold after every write;
// - stamps `updatedAt`. A write that changes nothing is skipped and leaves `updatedAt` alone.
//
// A missing or tombstoned bill, and an unknown item/person/adjustment id passed to an update,
// reject with NotFoundError. Removing an embedded entry that is already gone is a no-op.
//
// Framework-free: no React, no DOM.

import { z } from "zod";
import { db, DEFAULT_SETTINGS } from "./db";
import { allocate } from "./money";
import { nextColorIndex } from "./people";
import {
  amountSpecSchema,
  billInputSchema,
  billPatchSchema,
  billSchema,
  billSnapshotSchema,
  claimsInputSchema,
  feeOrDiscountInputSchema,
  idSchema,
  itemInputSchema,
  itemPatchSchema,
  MAX_ITEM_NAME,
  personNameSchema,
  settingsPatchSchema,
  settingsSchema,
  tipSpecSchema,
} from "./schemas";
import type {
  Adjustment,
  AmountSpec,
  Bill,
  BillInput,
  BillSnapshot,
  Item,
  ItemInput,
  Person,
  Settings,
  SplitMode,
} from "./types";

/**
 * A bill (or an entry on it) that doesn't exist or was deleted. Its `name` is deliberately
 * not "NotFoundError": Dexie maps an error thrown inside a transaction by name onto its own
 * DexieError classes, and "NotFoundError" is one of the DOMException names it claims.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoNotFoundError";
  }
}

const DEFAULT_TITLE = "Untitled bill";

const now = () => new Date().toISOString();

/** Today's date in the device's local time zone, YYYY-MM-DD. */
export function localToday(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const uuid = () => crypto.randomUUID();

/**
 * One read-modify-write of a live bill. `edit` mutates a deep copy and returns the call's
 * result; the copy is validated and written only if it differs from the stored row.
 */
async function mutateBill<T>(billId: string, edit: (draft: Bill) => T): Promise<T> {
  idSchema.parse(billId);
  return db.transaction("rw", db.bills, async () => {
    const stored = await db.bills.get(billId);
    if (!stored || stored.deletedAt !== null) throw new NotFoundError(`No bill ${billId}`);
    const draft = structuredClone(stored);
    const result = edit(draft);
    if (JSON.stringify(draft) !== JSON.stringify(stored)) {
      draft.updatedAt = now();
      await db.bills.put(billSchema.parse(draft));
    }
    return result;
  });
}

function findItem(bill: Bill, itemId: string): Item {
  const item = bill.items.find((it) => it.id === itemId);
  if (!item) throw new NotFoundError(`No item ${itemId} on bill ${bill.id}`);
  return item;
}

function findPersonIndex(bill: Bill, personId: string): number {
  const i = bill.people.findIndex((p) => p.id === personId);
  if (i < 0) throw new NotFoundError(`No person ${personId} on bill ${bill.id}`);
  return i;
}

function newItem(input: z.output<typeof itemInputSchema>): Item {
  return { id: uuid(), name: input.name, quantity: input.quantity ?? 1, priceCents: input.priceCents, claims: {} };
}

// ---------------------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------------------

/**
 * A new bill: "Untitled bill", today's local date, the settings currency, a tip adjustment
 * from `settings.defaultTip`, no people or items, nothing printed, no payer, nobody settled.
 */
export async function createBill(input: BillInput = {}): Promise<Bill> {
  const parsed = billInputSchema.parse(input);
  return db.transaction("rw", db.bills, db.settings, async () => {
    const settings = (await db.settings.get("settings")) ?? DEFAULT_SETTINGS;
    const ts = now();
    const bill: Bill = {
      id: uuid(),
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      title: parsed.title ?? DEFAULT_TITLE,
      date: parsed.date ?? localToday(),
      currency: parsed.currency ?? settings.currency,
      people: [],
      items: [],
      adjustments: [
        {
          id: uuid(),
          kind: "tip",
          label: "Tip",
          value: { type: "percent", bps: settings.defaultTip.bps },
          basis: settings.defaultTip.basis,
          split: "proportional",
        },
      ],
      printed: {},
      paidBy: null,
      settled: [],
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
    };
    const valid = billSchema.parse(bill);
    await db.bills.add(valid);
    return valid;
  });
}

/** Edit the title, date, currency, notes, or the printed receipt totals (replaced whole). */
export async function updateBill(id: string, patch: BillInput & { printed?: Bill["printed"] }): Promise<void> {
  const parsed = billPatchSchema.parse(patch);
  await mutateBill(id, (bill) => {
    if (parsed.title !== undefined) bill.title = parsed.title;
    if (parsed.date !== undefined) bill.date = parsed.date;
    if (parsed.currency !== undefined) bill.currency = parsed.currency;
    if (parsed.notes !== undefined) bill.notes = parsed.notes;
    if (parsed.printed !== undefined) bill.printed = parsed.printed;
  });
}

/** Tombstone: sets `deletedAt`; the row stays. Deleting an already-deleted bill is a no-op. */
export async function deleteBill(id: string): Promise<void> {
  idSchema.parse(id);
  await db.transaction("rw", db.bills, async () => {
    const stored = await db.bills.get(id);
    if (!stored) throw new NotFoundError(`No bill ${id}`);
    if (stored.deletedAt !== null) return;
    const ts = now();
    await db.bills.put({ ...stored, deletedAt: ts, updatedAt: ts });
  });
}

/**
 * Save a share-link / backup snapshot as a NEW bill. The bill, its people, items and
 * adjustments all get fresh UUIDs; claims, `paidBy` and `settled` are remapped to them.
 */
export async function importBill(snapshot: BillSnapshot): Promise<Bill> {
  const snap = billSnapshotSchema.parse(snapshot);
  const personIds = new Map(snap.people.map((p) => [p.id, uuid()]));
  const pid = (old: string) => personIds.get(old)!; // the schema guarantees every reference resolves
  const ts = now();
  const bill: Bill = {
    id: uuid(),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    title: snap.title,
    date: snap.date,
    currency: snap.currency,
    people: snap.people.map((p) => ({ ...p, id: pid(p.id) })),
    items: snap.items.map((it) => ({
      ...it,
      id: uuid(),
      claims: Object.fromEntries(Object.entries(it.claims).map(([old, shares]) => [pid(old), shares])),
    })),
    adjustments: snap.adjustments.map((a) => ({ ...structuredClone(a), id: uuid() })),
    printed: { ...snap.printed },
    paidBy: snap.paidBy === null ? null : pid(snap.paidBy),
    settled: snap.settled.map(pid),
    ...(snap.notes !== undefined ? { notes: snap.notes } : {}),
  };
  const valid = billSchema.parse(bill);
  await db.transaction("rw", db.bills, async () => {
    await db.bills.add(valid);
  });
  return valid;
}

// ---------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------

export async function addItem(billId: string, input: ItemInput): Promise<Item> {
  const parsed = itemInputSchema.parse(input);
  return mutateBill(billId, (bill) => {
    const item = newItem(parsed);
    bill.items.push(item);
    return item;
  });
}

/** Paste/scan import: append every item in one transaction (all or nothing). */
export async function addItems(billId: string, inputs: ItemInput[]): Promise<Item[]> {
  const parsed = z.array(itemInputSchema).parse(inputs);
  return mutateBill(billId, (bill) => {
    const items = parsed.map(newItem);
    bill.items.push(...items);
    return items;
  });
}

/** Edit an item's name, quantity or price. Claims are untouched. */
export async function updateItem(billId: string, itemId: string, patch: Partial<ItemInput>): Promise<void> {
  idSchema.parse(itemId);
  const parsed = itemPatchSchema.parse(patch);
  await mutateBill(billId, (bill) => {
    const item = findItem(bill, itemId);
    if (parsed.name !== undefined) item.name = parsed.name;
    if (parsed.quantity !== undefined) item.quantity = parsed.quantity;
    if (parsed.priceCents !== undefined) item.priceCents = parsed.priceCents;
  });
}

export async function removeItem(billId: string, itemId: string): Promise<void> {
  idSchema.parse(itemId);
  await mutateBill(billId, (bill) => {
    bill.items = bill.items.filter((it) => it.id !== itemId);
  });
}

/**
 * Quantity N → N items of quantity 1, in the original's place. Prices come from
 * `allocate(price, [1 × N])`, so they sum exactly ($20.00 × 3 → 667, 667, 666). Names get
 * " (i/N)" (the base name is shortened if needed to stay within 80 chars); claims are cleared.
 * An item of quantity 1 is returned unchanged.
 */
export async function explodeItem(billId: string, itemId: string): Promise<Item[]> {
  idSchema.parse(itemId);
  return mutateBill(billId, (bill) => {
    const index = bill.items.findIndex((it) => it.id === itemId);
    if (index < 0) throw new NotFoundError(`No item ${itemId} on bill ${bill.id}`);
    const item = bill.items[index];
    const n = item.quantity;
    if (n <= 1) return [item];
    const prices = allocate(item.priceCents, new Array<number>(n).fill(1), 0);
    const parts: Item[] = prices.map((priceCents, i) => {
      const suffix = ` (${i + 1}/${n})`;
      const base = item.name.slice(0, MAX_ITEM_NAME - suffix.length).trimEnd();
      return { id: uuid(), name: `${base}${suffix}`, quantity: 1, priceCents, claims: {} };
    });
    bill.items.splice(index, 1, ...parts);
    return parts;
  });
}

// ---------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------

/** Append a person with the lowest unused colour (wrapping after 8). */
export async function addPerson(billId: string, name: string): Promise<Person> {
  const parsed = personNameSchema.parse(name);
  return mutateBill(billId, (bill) => {
    const person: Person = { id: uuid(), name: parsed, colorIndex: nextColorIndex(bill.people) };
    bill.people.push(person);
    return person;
  });
}

export async function renamePerson(billId: string, personId: string, name: string): Promise<void> {
  idSchema.parse(personId);
  const parsed = personNameSchema.parse(name);
  await mutateBill(billId, (bill) => {
    bill.people[findPersonIndex(bill, personId)].name = parsed;
  });
}

/**
 * Remove a person: strips their claims from every item (which may leave items unclaimed
 * again), clears `paidBy` if it was them, and drops them from `settled`.
 */
export async function removePerson(billId: string, personId: string): Promise<void> {
  idSchema.parse(personId);
  await mutateBill(billId, (bill) => {
    bill.people = bill.people.filter((p) => p.id !== personId);
    for (const item of bill.items) delete item.claims[personId];
    if (bill.paidBy === personId) bill.paidBy = null;
    bill.settled = bill.settled.filter((id) => id !== personId);
  });
}

/** Move a person to `toIndex` (clamped to the list) in display / tie-break order. */
export async function movePerson(billId: string, personId: string, toIndex: number): Promise<void> {
  idSchema.parse(personId);
  const to = z.number().int().parse(toIndex);
  await mutateBill(billId, (bill) => {
    const from = findPersonIndex(bill, personId);
    const [person] = bill.people.splice(from, 1);
    bill.people.splice(Math.max(0, Math.min(to, bill.people.length)), 0, person);
  });
}

export async function setPayer(billId: string, personId: string | null): Promise<void> {
  const parsed = idSchema.nullable().parse(personId);
  await mutateBill(billId, (bill) => {
    if (parsed !== null) findPersonIndex(bill, parsed);
    bill.paidBy = parsed;
  });
}

// ---------------------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------------------

/** Absent ↔ 1 share. A person with 2+ shares un-claims. */
export async function toggleClaim(billId: string, itemId: string, personId: string): Promise<void> {
  idSchema.parse(itemId);
  idSchema.parse(personId);
  await mutateBill(billId, (bill) => {
    findPersonIndex(bill, personId);
    const item = findItem(bill, itemId);
    if (personId in item.claims) delete item.claims[personId];
    else item.claims[personId] = 1;
  });
}

/**
 * Replace an item's whole claim map. Zero and negative entries are dropped (0 is never
 * stored); shares over 99, non-integers and unknown person ids reject with a ZodError.
 */
export async function setClaims(billId: string, itemId: string, claims: Record<string, number>): Promise<void> {
  idSchema.parse(itemId);
  const parsed = claimsInputSchema.parse(claims);
  await mutateBill(billId, (bill) => {
    findItem(bill, itemId).claims = parsed;
  });
}

/** "Split the rest": every item with `{}` claims gets 1 share for each of `personIds`. */
export async function claimRemaining(billId: string, personIds: string[]): Promise<void> {
  const parsed = [...new Set(z.array(idSchema).min(1).parse(personIds))];
  await mutateBill(billId, (bill) => {
    for (const pid of parsed) findPersonIndex(bill, pid);
    for (const item of bill.items) {
      if (Object.keys(item.claims).length === 0) item.claims = Object.fromEntries(parsed.map((pid) => [pid, 1]));
    }
  });
}

// ---------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------

/**
 * Set or replace the bill's single adjustment of `kind`, keeping its id, label and position.
 * `null` removes it.
 */
function setSingleton(bill: Bill, kind: "tax" | "tip", next: Omit<Adjustment, "id" | "kind" | "label"> | null): void {
  const current = bill.adjustments.find((a) => a.kind === kind);
  if (next === null) {
    bill.adjustments = bill.adjustments.filter((a) => a.kind !== kind);
    return;
  }
  const adj: Adjustment = {
    id: current?.id ?? uuid(),
    kind,
    label: current?.label ?? (kind === "tax" ? "Tax" : "Tip"),
    ...next,
  };
  if (current) bill.adjustments = bill.adjustments.map((a) => (a === current ? adj : a));
  else bill.adjustments.push(adj);
}

/** Set the tax (proportional), or remove it with `null`. At most one tax per bill. */
export async function setTax(billId: string, value: AmountSpec | null): Promise<void> {
  const parsed = amountSpecSchema.nullable().parse(value);
  await mutateBill(billId, (bill) => {
    setSingleton(bill, "tax", parsed === null ? null : { value: parsed, split: "proportional" });
  });
}

/** Set the tip, or remove it with `null`. At most one tip per bill. */
export async function setTip(
  billId: string,
  spec: { value: AmountSpec; basis: "pretax" | "posttax"; split: SplitMode } | null,
): Promise<void> {
  const parsed = tipSpecSchema.nullable().parse(spec);
  await mutateBill(billId, (bill) => {
    setSingleton(bill, "tip", parsed === null ? null : { value: parsed.value, basis: parsed.basis, split: parsed.split });
  });
}

/**
 * Add a fee or discount, or replace one by id. Tax and tip go through setTax / setTip; an
 * id that names no fee/discount on the bill rejects with NotFoundError.
 */
export async function upsertAdjustment(
  billId: string,
  adj: Omit<Adjustment, "id"> & { id?: string },
): Promise<Adjustment> {
  const parsed = feeOrDiscountInputSchema.parse(adj);
  return mutateBill(billId, (bill) => {
    const next: Adjustment = {
      id: parsed.id ?? uuid(),
      kind: parsed.kind,
      label: parsed.label,
      value: parsed.value,
      split: parsed.split,
    };
    if (parsed.id === undefined) {
      bill.adjustments.push(next);
      return next;
    }
    const index = bill.adjustments.findIndex((a) => a.id === parsed.id);
    const existing = bill.adjustments[index];
    if (!existing || (existing.kind !== "fee" && existing.kind !== "discount")) {
      throw new NotFoundError(`No fee or discount ${parsed.id} on bill ${bill.id}`);
    }
    bill.adjustments[index] = next;
    return next;
  });
}

/** Remove any adjustment (tax, tip, fee or discount) by id. */
export async function removeAdjustment(billId: string, adjustmentId: string): Promise<void> {
  idSchema.parse(adjustmentId);
  await mutateBill(billId, (bill) => {
    bill.adjustments = bill.adjustments.filter((a) => a.id !== adjustmentId);
  });
}

// ---------------------------------------------------------------------------------------
// Settlement and settings
// ---------------------------------------------------------------------------------------

/** Mark a person as having paid back (or not). */
export async function setSettled(billId: string, personId: string, settled: boolean): Promise<void> {
  idSchema.parse(personId);
  const flag = z.boolean().parse(settled);
  await mutateBill(billId, (bill) => {
    findPersonIndex(bill, personId);
    const has = bill.settled.includes(personId);
    if (flag && !has) bill.settled.push(personId);
    if (!flag && has) bill.settled = bill.settled.filter((id) => id !== personId);
  });
}

/** Change the default currency and/or default tip. Creates the row from defaults if missing. */
export async function updateSettings(patch: Partial<Omit<Settings, "id" | "updatedAt">>): Promise<void> {
  const parsed = settingsPatchSchema.parse(patch);
  await db.transaction("rw", db.settings, async () => {
    const current = (await db.settings.get("settings")) ?? { ...DEFAULT_SETTINGS, updatedAt: now() };
    const next: Settings = {
      ...current,
      ...(parsed.currency !== undefined ? { currency: parsed.currency } : {}),
      ...(parsed.defaultTip !== undefined ? { defaultTip: parsed.defaultTip } : {}),
      updatedAt: now(),
    };
    await db.settings.put(settingsSchema.parse(next));
  });
}
