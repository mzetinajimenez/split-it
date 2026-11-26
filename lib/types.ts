// lib/types.ts: the contract. Other issues code against exactly these shapes (spec §4–§7).
// Types only: no runtime code, no React, no DOM.

// ---------------------------------------------------------------------------------------
// §4 Data model
// ---------------------------------------------------------------------------------------

export type SyncFields = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };

/** Integer minor units of the bill's currency (cents for USD, yen for JPY). NEVER a float. */
export type Cents = number;

export interface Person {
  id: string; // crypto.randomUUID()
  name: string; // 1..40 chars, trimmed
  colorIndex: number; // 0..7 → --color-person-0..7
}

export interface Item {
  id: string;
  name: string; // 1..80 chars
  quantity: number; // integer ≥ 1, display only — priceCents is the LINE total
  priceCents: Cents; // integer ≥ 0
  claims: Record<string, number>; // personId → shares (integer 1..99). {} = unclaimed. 0 is never stored.
}

export type AmountSpec =
  | { type: "amount"; cents: Cents } // fixed amount, ≥ 0 (discounts are positive too; kind decides the sign)
  | { type: "percent"; bps: number }; // basis points: 825 = 8.25%, integer 0..10000

export type SplitMode = "proportional" | "equal";

export interface Adjustment {
  id: string;
  kind: "tax" | "tip" | "fee" | "discount";
  label: string; // "Tax", "Tip", "Service charge", "Happy hour"
  value: AmountSpec;
  basis?: "pretax" | "posttax"; // tip only; default "pretax"
  split: SplitMode; // default "proportional"
}

export interface Bill extends SyncFields {
  title: string; // default "Untitled bill"
  date: string; // YYYY-MM-DD, default today (local)
  currency: string; // ISO 4217, default from settings
  people: Person[]; // ordered; order is display order AND tie-break order
  items: Item[]; // ordered as on the receipt
  adjustments: Adjustment[]; // ≤ 1 tax, ≤ 1 tip, any number of fee/discount
  printed: { subtotalCents?: Cents; totalCents?: Cents }; // as printed on the receipt — reconciliation only
  paidBy: string | null; // personId
  settled: string[]; // personIds marked "paid back"
  notes?: string;
}

export interface Settings {
  id: "settings";
  currency: string; // default "USD"
  defaultTip: { bps: number; basis: "pretax" | "posttax" }; // default 2000 / "pretax"
  updatedAt: string;
}

export interface Meta {
  id: "meta";
  schemaVersion: number;
  installId: string;
  createdAt: string;
  updatedAt: string;
}

export type BillInput = Partial<Pick<Bill, "title" | "date" | "currency" | "notes">>;
export type ItemInput = { name: string; quantity?: number; priceCents: Cents };

/**
 * The share-link / backup shape (spec §7): a Bill minus its SyncFields. It carries no row
 * id, timestamps or tombstone. The embedded `id`s (people, items, adjustments, plus the
 * person ids referenced by `claims`, `paidBy` and `settled`) may be positional, e.g.
 * `"0"`, `"1"`, … from the compact share encoding; `importBill` mints fresh ids.
 */
export type BillSnapshot = Omit<Bill, keyof SyncFields>;

// ---------------------------------------------------------------------------------------
// §5 Split engine results
// ---------------------------------------------------------------------------------------

export interface PersonLine {
  itemId: string;
  name: string;
  shares: number;
  totalShares: number;
  cents: Cents;
}

export interface PersonResult {
  personId: string;
  lines: PersonLine[]; // their item portions, in receipt order
  subtotalCents: Cents; // Σ lines
  discountCents: Cents; // ≤ 0
  taxCents: Cents;
  feeCents: Cents;
  tipCents: Cents;
  totalCents: Cents; // subtotal + discount + tax + fee + tip
  owesTo: string | null; // paidBy, unless they ARE the payer (or no payer set)
  settled: boolean;
}

export interface SplitResult {
  people: PersonResult[]; // bill.people order
  itemsSubtotalCents: Cents; // Σ every item price
  adjustments: { id: string; kind: Adjustment["kind"]; label: string; cents: Cents }[]; // resolved, signed
  grandTotalCents: Cents; // items + Σ adjustments
  unclaimed: { itemIds: string[]; itemsCents: Cents; totalCents: Cents }; // totalCents incl. its share of proportional adjustments
  status: "empty" | "unclaimed" | "balanced";
  printed: { subtotalDiffCents: Cents | null; totalDiffCents: Cents | null }; // computed − printed; null if not entered
}

// ---------------------------------------------------------------------------------------
// §6 Receipt paste parser
// ---------------------------------------------------------------------------------------

export interface DraftItem {
  name: string;
  quantity: number;
  priceCents: Cents;
  line: number;
  confidence: "high" | "low";
}

export interface ParsedReceipt {
  items: DraftItem[];
  totals: { subtotalCents?: Cents; taxCents?: Cents; tipCents?: Cents; totalCents?: Cents };
  ignored: { line: number; text: string; reason: "no_price" | "payment" | "total" | "noise" }[];
}
