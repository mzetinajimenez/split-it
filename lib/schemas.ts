// lib/schemas.ts: the zod field schemas (spec §4). The single write path (lib/repo.ts), the
// share-link decode (lib/share.ts) and backup import (lib/backup.ts) all validate with
// these, so a value that is legal in one place is legal in all three.
//
// Framework-free: no React, no DOM, no Dexie.

import { z } from "zod";
import { MAX_CENTS } from "./money";
import type { Adjustment, AmountSpec, Bill, BillSnapshot, Item, Meta, Person, Settings } from "./types";

// ---------------------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------------------

export const MAX_PERSON_NAME = 40;
export const MAX_ITEM_NAME = 80;
export const MAX_TITLE = 80;
export const MAX_LABEL = 40;
export const MAX_NOTES = 1000;
/** Shares per person on one item (spec §5.1, §5.7). */
export const MAX_SHARES = 99;
/** Display-only quantity cap. Also bounds `explodeItem`'s output. */
export const MAX_QUANTITY = 999;
/** Defensive per-bill caps: a real bill is well under ~200 items (spec §4). */
export const MAX_ITEMS = 500;
export const MAX_PEOPLE = 100;
export const MAX_BPS = 10_000;

// ---------------------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------------------

/** Embedded ids: a UUID from the repo, or a positional "0", "1", … from a share snapshot. */
export const idSchema = z.string().min(1).max(64);

/** Integer minor units, 0..MAX_CENTS. Never a float. */
export const centsSchema = z.number().int().min(0).max(MAX_CENTS);

export const bpsSchema = z.number().int().min(0).max(MAX_BPS);

export const sharesSchema = z.number().int().min(1).max(MAX_SHARES);

export const quantitySchema = z.number().int().min(1).max(MAX_QUANTITY);

export const personNameSchema = z.string().trim().min(1).max(MAX_PERSON_NAME);
export const itemNameSchema = z.string().trim().min(1).max(MAX_ITEM_NAME);
export const titleSchema = z.string().trim().min(1).max(MAX_TITLE);
export const labelSchema = z.string().trim().min(1).max(MAX_LABEL);
export const notesSchema = z.string().max(MAX_NOTES);

/** ISO 4217 code, normalised to upper case ("usd" → "USD"). */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Expected an ISO 4217 currency code")
  .refine((code) => {
    try {
      new Intl.NumberFormat("en-US", { style: "currency", currency: code });
      return true;
    } catch {
      return false;
    }
  }, "Unknown currency");

/** A calendar date, YYYY-MM-DD, that actually exists (no 2026-02-30). */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Not a real date");

/** ISO 8601 timestamp as written by `new Date().toISOString()`. */
export const timestampSchema = z.iso.datetime();

export const amountSpecSchema: z.ZodType<AmountSpec> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("amount"), cents: centsSchema }).strict(),
  z.object({ type: z.literal("percent"), bps: bpsSchema }).strict(),
]);

export const splitModeSchema = z.enum(["proportional", "equal"]);
export const tipBasisSchema = z.enum(["pretax", "posttax"]);
export const adjustmentKindSchema = z.enum(["tax", "tip", "fee", "discount"]);

// ---------------------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------------------

export const personSchema: z.ZodType<Person> = z
  .object({
    id: idSchema,
    name: personNameSchema,
    colorIndex: z.number().int().min(0).max(7),
  })
  .strict();

/** personId → shares. Every stored value is 1..99; 0 is never stored (spec §5.7). */
export const claimsSchema = z.record(idSchema, sharesSchema);

export const itemSchema: z.ZodType<Item> = z
  .object({
    id: idSchema,
    name: itemNameSchema,
    quantity: quantitySchema,
    priceCents: centsSchema,
    claims: claimsSchema,
  })
  .strict();

export const adjustmentSchema: z.ZodType<Adjustment> = z
  .object({
    id: idSchema,
    kind: adjustmentKindSchema,
    label: labelSchema,
    value: amountSpecSchema,
    basis: tipBasisSchema.optional(),
    split: splitModeSchema,
  })
  .strict()
  .refine((a) => a.kind === "tip" || a.basis === undefined, {
    message: "Only a tip has a basis",
    path: ["basis"],
  });

export const printedSchema = z
  .object({ subtotalCents: centsSchema.optional(), totalCents: centsSchema.optional() })
  .strict();

const snapshotShape = {
  title: titleSchema,
  date: dateSchema,
  currency: currencySchema,
  people: z.array(personSchema).max(MAX_PEOPLE),
  items: z.array(itemSchema).max(MAX_ITEMS),
  adjustments: z.array(adjustmentSchema),
  printed: printedSchema,
  paidBy: idSchema.nullable(),
  settled: z.array(idSchema),
  notes: notesSchema.optional(),
};

const syncShape = {
  id: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  deletedAt: timestampSchema.nullable(),
};

/**
 * Upper bound on any single resolved adjustment's magnitude (spec §5.4), computed from the
 * stored specs alone so it needs no split engine:
 * - a discount is clamped to ≤ S in total, so each one is ≤ S;
 * - a percent tax, fee or pre-tax tip is ≤ S (bps ≤ 10000; the base is S or S + D ≤ S);
 * - a fixed amount is itself;
 * - a percent post-tax tip is ≤ S + T + F, at their own upper bounds.
 */
export function maxAdjustmentCents(bill: Pick<BillSnapshot, "items" | "adjustments">): number {
  const s = bill.items.reduce((sum, item) => sum + item.priceCents, 0);
  const bound = (a: Adjustment): number => (a.value.type === "amount" ? a.value.cents : s);
  let max = s;
  let preTip = s;
  for (const a of bill.adjustments) {
    if (a.kind === "discount") continue;
    if (a.kind === "tax" || a.kind === "fee") preTip += bound(a);
    if (a.value.type === "amount") max = Math.max(max, a.value.cents);
  }
  for (const a of bill.adjustments) {
    if (a.kind === "tip" && a.value.type === "percent" && a.basis === "posttax") max = Math.max(max, preTip);
  }
  return max;
}

/**
 * Cross-field rules a bill must satisfy on every write:
 * - ids are unique within people, items and adjustments;
 * - claims, `paidBy` and `settled` reference people on the bill; `settled` has no repeats;
 * - at most one tax and one tip (spec §4);
 * - the items subtotal is ≤ MAX_CENTS, and S × (largest possible adjustment) ≤ 2^53, so
 *   `allocate()`'s proportional splits (weights = person subtotals, Σ = S) are always
 *   exact. Real bills are many orders of magnitude below this.
 */
function refineBill(bill: BillSnapshot, ctx: z.RefinementCtx): void {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });

  const dupes = (ids: string[], path: string) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) issue(`Duplicate id ${JSON.stringify(id)}`, [path, i, "id"]);
      seen.add(id);
    });
  };
  dupes(bill.people.map((p) => p.id), "people");
  dupes(bill.items.map((it) => it.id), "items");
  dupes(bill.adjustments.map((a) => a.id), "adjustments");

  const personIds = new Set(bill.people.map((p) => p.id));
  bill.items.forEach((item, i) => {
    for (const pid of Object.keys(item.claims)) {
      if (!personIds.has(pid)) issue(`Claim by unknown person ${JSON.stringify(pid)}`, ["items", i, "claims", pid]);
    }
  });
  if (bill.paidBy !== null && !personIds.has(bill.paidBy)) issue("Payer is not on the bill", ["paidBy"]);
  const settled = new Set<string>();
  bill.settled.forEach((pid, i) => {
    if (!personIds.has(pid)) issue("Settled person is not on the bill", ["settled", i]);
    if (settled.has(pid)) issue("Person settled twice", ["settled", i]);
    settled.add(pid);
  });

  for (const kind of ["tax", "tip"] as const) {
    if (bill.adjustments.filter((a) => a.kind === kind).length > 1) issue(`At most one ${kind}`, ["adjustments"]);
  }

  const subtotal = bill.items.reduce((sum, item) => sum + item.priceCents, 0);
  if (subtotal > MAX_CENTS) {
    issue("The items add up to more than the largest supported amount", ["items"]);
  } else if (subtotal * maxAdjustmentCents(bill) > Number.MAX_SAFE_INTEGER) {
    issue("The bill's adjustments are too large to split exactly", ["adjustments"]);
  }
}

/** A bill without its SyncFields: the share-link / backup shape (`BillSnapshot`). */
export const billSnapshotSchema: z.ZodType<BillSnapshot> = z.object(snapshotShape).strict().superRefine(refineBill);

/** A complete stored bill row. */
export const billSchema: z.ZodType<Bill> = z
  .object({ ...syncShape, ...snapshotShape })
  .strict()
  .superRefine(refineBill);

export const defaultTipSchema = z.object({ bps: bpsSchema, basis: tipBasisSchema }).strict();

export const settingsSchema: z.ZodType<Settings> = z
  .object({
    id: z.literal("settings"),
    currency: currencySchema,
    defaultTip: defaultTipSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const metaSchema: z.ZodType<Meta> = z
  .object({
    id: z.literal("meta"),
    schemaVersion: z.number().int().min(1),
    installId: z.string().min(1),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

// ---------------------------------------------------------------------------------------
// Repo inputs
// ---------------------------------------------------------------------------------------

export const billInputSchema = z
  .object({
    title: titleSchema.optional(),
    date: dateSchema.optional(),
    currency: currencySchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict();

export const billPatchSchema = billInputSchema.extend({ printed: printedSchema.optional() }).strict();

export const itemInputSchema = z
  .object({ name: itemNameSchema, quantity: quantitySchema.optional(), priceCents: centsSchema })
  .strict();

export const itemPatchSchema = itemInputSchema.partial().strict();

/**
 * `setClaims` input: shares must be integers ≤ 99. Zero and negative entries are dropped
 * (0 is never stored); unknown person ids are rejected by the bill-level rules.
 */
export const claimsInputSchema = z
  .record(idSchema, z.number().int().max(MAX_SHARES))
  .transform((claims) => Object.fromEntries(Object.entries(claims).filter(([, shares]) => shares > 0)));

export const tipSpecSchema = z
  .object({ value: amountSpecSchema, basis: tipBasisSchema, split: splitModeSchema })
  .strict();

/** `upsertAdjustment` input: fee and discount only; tax and tip go through setTax / setTip. */
export const feeOrDiscountInputSchema = z
  .object({
    id: idSchema.optional(),
    kind: z.enum(["fee", "discount"]),
    label: labelSchema,
    value: amountSpecSchema,
    basis: z.undefined().optional(), // only a tip has a basis
    split: splitModeSchema,
  })
  .strict();

export const settingsPatchSchema = z
  .object({ currency: currencySchema.optional(), defaultTip: defaultTipSchema.optional() })
  .strict();
