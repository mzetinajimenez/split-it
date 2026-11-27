// lib/share.ts: the share-link codec (spec §7). A whole bill travels in the URL fragment
// (`/s#<payload>`), which never reaches a server: private by construction, no backend.
//
//   payload = "1." + base64url(deflate-raw(UTF-8(JSON(compact))))
//
// Compression is the built-in CompressionStream / DecompressionStream("deflate-raw")
// (Safari 16.4+, Chrome 80+, Firefox 113+, Node 18+). No dependency.
//
// ---------------------------------------------------------------------------------------
// Compact format, version 1
// ---------------------------------------------------------------------------------------
//
// One JSON array, positional throughout. Person references are INDICES into `people`, never
// UUIDs; item and adjustment ids are dropped (their position is their identity). No sync
// fields, no device ids.
//
//   [title, date, currency, people, items, adjustments, printed, paidBy, settled, notes?]
//
//   people       [[name, colorIndex], …]                       in bill order
//   items        [[name, quantity, priceCents, claims], …]     in receipt order
//     claims     [personIndex, shares, personIndex, shares, …] flat pairs; [] = unclaimed
//   adjustments  [[kind, label, valueType, value, split, basis], …]
//     kind       0 tax · 1 tip · 2 fee · 3 discount
//     valueType  0 amount (value = cents) · 1 percent (value = bps)
//     split      0 proportional · 1 equal
//     basis      0 unset · 1 pretax · 2 posttax                 (only a tip has one)
//   printed      [subtotalCents | null, totalCents | null]
//   paidBy       personIndex | null
//   settled      [personIndex, …]
//   notes        string, present only when the bill has notes
//
// A new layout gets a new version prefix; v1 payloads decode forever. The decoder mints
// fresh, positional local ids ("0", "1", … per collection, as `BillSnapshot` documents);
// `importBill` replaces them with UUIDs when a copy is saved.
//
// Framework-free: no React, no DOM beyond the web-standard streams/atob/btoa globals.

import { z } from "zod";
import { billSnapshotSchema } from "./schemas";
import type { Adjustment, Bill, BillSnapshot, Cents } from "./types";

export const SHARE_VERSION = 1;

/** Inflated JSON larger than this is refused (a tiny payload can't balloon into memory). */
const MAX_INFLATED_BYTES = 1_000_000;

export type ShareDecodeReason = "version" | "corrupt" | "invalid";

const MESSAGES: Record<ShareDecodeReason, string> = {
  version: "This link was made by a newer version of split-it.",
  corrupt: "This link is broken or incomplete.",
  invalid: "This link doesn't contain a valid bill.",
};

export class ShareDecodeError extends Error {
  readonly reason: ShareDecodeReason;
  constructor(reason: ShareDecodeReason, options?: { cause?: unknown }) {
    super(MESSAGES[reason], options);
    this.name = "ShareDecodeError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------------------

/** A bill minus its SyncFields; keeps people, items, claims, adjustments, printed, paidBy, settled. */
export function toSnapshot(bill: Bill): BillSnapshot {
  const snapshot: BillSnapshot = {
    title: bill.title,
    date: bill.date,
    currency: bill.currency,
    people: bill.people.map((p) => ({ ...p })),
    items: bill.items.map((it) => ({ ...it, claims: { ...it.claims } })),
    adjustments: bill.adjustments.map((a) => ({ ...a, value: { ...a.value } })),
    printed: { ...bill.printed },
    paidBy: bill.paidBy,
    settled: [...bill.settled],
  };
  if (bill.notes !== undefined) snapshot.notes = bill.notes;
  return snapshot;
}

function isBill(bill: Bill | BillSnapshot): bill is Bill {
  return "createdAt" in bill;
}

// ---------------------------------------------------------------------------------------
// Compact <-> snapshot
// ---------------------------------------------------------------------------------------

const KINDS = ["tax", "tip", "fee", "discount"] as const;
const SPLITS = ["proportional", "equal"] as const;
const BASES = [undefined, "pretax", "posttax"] as const;

type CompactPerson = [string, number];
type CompactItem = [string, number, Cents, number[]];
type CompactAdjustment = [number, string, number, number, number, number];
type CompactBill = [
  string,
  string,
  string,
  CompactPerson[],
  CompactItem[],
  CompactAdjustment[],
  [Cents | null, Cents | null],
  number | null,
  number[],
  string?,
];

function toCompact(snapshot: BillSnapshot): CompactBill {
  const index = new Map(snapshot.people.map((p, i) => [p.id, i]));
  const ref = (id: string): number => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`encodeShare: unknown person id ${JSON.stringify(id)}`);
    return i;
  };
  const compact: CompactBill = [
    snapshot.title,
    snapshot.date,
    snapshot.currency,
    snapshot.people.map((p) => [p.name, p.colorIndex]),
    snapshot.items.map((it) => [
      it.name,
      it.quantity,
      it.priceCents,
      Object.entries(it.claims)
        .map(([pid, shares]) => [ref(pid), shares])
        .sort((a, b) => a[0] - b[0])
        .flat(),
    ]),
    snapshot.adjustments.map((a) => [
      KINDS.indexOf(a.kind),
      a.label,
      a.value.type === "amount" ? 0 : 1,
      a.value.type === "amount" ? a.value.cents : a.value.bps,
      SPLITS.indexOf(a.split),
      BASES.indexOf(a.basis),
    ]),
    [snapshot.printed.subtotalCents ?? null, snapshot.printed.totalCents ?? null],
    snapshot.paidBy === null ? null : ref(snapshot.paidBy),
    snapshot.settled.map(ref),
  ];
  if (snapshot.notes !== undefined) compact.push(snapshot.notes);
  return compact;
}

// Structural check of the compact array. Field-level rules (lengths, money bounds, dates,
// currency, one tax/tip, …) are left to billSnapshotSchema after expansion, so the rules
// live in one place.
const int = z.number().int();
const compactSchema = z
  .tuple(
    [
      z.string(), // title
      z.string(), // date
      z.string(), // currency
      z.array(z.tuple([z.string(), int])),
      z.array(z.tuple([z.string(), int, int, z.array(int)])),
      z.array(
        z.tuple([
          int.min(0).max(KINDS.length - 1),
          z.string(),
          int.min(0).max(1),
          int,
          int.min(0).max(SPLITS.length - 1),
          int.min(0).max(BASES.length - 1),
        ]),
      ),
      z.tuple([int.nullable(), int.nullable()]),
      int.nullable(),
      z.array(int),
    ],
    z.string(), // notes (optional trailing element)
  )
  .refine((c) => c.length <= 10, "Too many fields");

function fromCompact(raw: unknown): BillSnapshot {
  const parsed = compactSchema.safeParse(raw);
  if (!parsed.success) throw new ShareDecodeError("invalid", { cause: parsed.error });
  const [title, date, currency, people, items, adjustments, printed, paidBy, settled, notes] =
    parsed.data as unknown as CompactBill;

  const person = (i: number): string => {
    if (!Number.isInteger(i) || i < 0 || i >= people.length) {
      throw new ShareDecodeError("invalid", { cause: new Error(`Person index ${i} out of range`) });
    }
    return String(i);
  };

  const snapshot: BillSnapshot = {
    title,
    date,
    currency,
    people: people.map(([name, colorIndex], i) => ({ id: String(i), name, colorIndex })),
    items: items.map(([name, quantity, priceCents, flat], i) => {
      if (flat.length % 2 !== 0) throw new ShareDecodeError("invalid", { cause: new Error("Odd claims array") });
      const claims: Record<string, number> = {};
      for (let k = 0; k < flat.length; k += 2) {
        const pid = person(flat[k]);
        if (pid in claims) throw new ShareDecodeError("invalid", { cause: new Error("Duplicate claim") });
        claims[pid] = flat[k + 1];
      }
      return { id: String(i), name, quantity, priceCents, claims };
    }),
    adjustments: adjustments.map(([kind, label, valueType, value, split, basis], i) => {
      const adj: Adjustment = {
        id: String(i),
        kind: KINDS[kind],
        label,
        value: valueType === 0 ? { type: "amount", cents: value } : { type: "percent", bps: value },
        split: SPLITS[split],
      };
      if (BASES[basis] !== undefined) adj.basis = BASES[basis];
      return adj;
    }),
    printed: {
      ...(printed[0] !== null && { subtotalCents: printed[0] }),
      ...(printed[1] !== null && { totalCents: printed[1] }),
    },
    paidBy: paidBy === null ? null : person(paidBy),
    settled: settled.map(person),
  };
  if (notes !== undefined) snapshot.notes = notes;

  const valid = billSnapshotSchema.safeParse(snapshot);
  if (!valid.success) throw new ShareDecodeError("invalid", { cause: valid.error });
  return valid.data;
}

// ---------------------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------------------

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream, limit = Infinity) {
  const writer = transform.writable.getWriter();
  // Errors surface on the read side; swallow them here so they aren't unhandled.
  writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new Error("Inflated payload too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error("Not base64url");
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/** `"1." + base64url(deflate-raw(JSON(compact)))`; safe in a URL fragment as-is. */
export async function encodeShare(bill: Bill | BillSnapshot): Promise<string> {
  const snapshot = isBill(bill) ? toSnapshot(bill) : bill;
  const json = JSON.stringify(toCompact(snapshot));
  const deflated = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return `${SHARE_VERSION}.${toBase64Url(deflated)}`;
}

/**
 * Decode a share payload (a leading "#" is tolerated). Throws `ShareDecodeError`:
 * `"version"` for a version this build doesn't know, `"corrupt"` for bad base64, deflate or
 * JSON, `"invalid"` when the bill fails validation (including out-of-range person indices).
 */
export async function decodeShare(payload: string): Promise<BillSnapshot> {
  const text = payload.startsWith("#") ? payload.slice(1) : payload;
  const match = /^(\d+)\.(.*)$/s.exec(text);
  if (!match) throw new ShareDecodeError("corrupt", { cause: new Error("Missing version prefix") });
  if (match[1] !== String(SHARE_VERSION)) throw new ShareDecodeError("version");

  let raw: unknown;
  try {
    const inflated = await pipe(fromBase64Url(match[2]), new DecompressionStream("deflate-raw"), MAX_INFLATED_BYTES);
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(inflated));
  } catch (cause) {
    throw new ShareDecodeError("corrupt", { cause });
  }
  return fromCompact(raw);
}

/** The shareable URL: the payload rides in the fragment, never a query param. */
export function shareUrl(origin: string, payload: string): string {
  return `${origin.replace(/\/+$/, "")}/s#${payload}`;
}
