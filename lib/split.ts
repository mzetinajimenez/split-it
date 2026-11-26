// lib/split.ts: the split engine (spec §5, pinned semantics). The ONLY code that allocates
// a bill's money to people.
//
// Pure and synchronous: no React, no DOM, no `Date`. Every amount is integer minor units;
// every split goes through `distribute` (below, over lib/money.ts `allocate`) and every
// percent through `percentOf`, so there is no float money math here. Splits are derived at
// render and never stored.

import { allocate, percentOf } from "./money";
import type { Adjustment, Bill, Cents, Item, Person, PersonLine, PersonResult, SplitResult } from "./types";

/** A resolved adjustment: its signed cents (discounts ≤ 0, everything else ≥ 0). */
export type ResolvedAdjustment = SplitResult["adjustments"][number];

/** 0 − x, without producing −0 (keeps deep-equality and formatting clean). */
function negate(x: Cents): Cents {
  return x === 0 ? 0 : -x;
}

function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

/**
 * Who is sharing one amount: the recipients' ids, parallel to the weights (`null` = the
 * "unclaimed" pseudo-participant, never the payer), and the bill's payer (null when none
 * is set or the id isn't on the bill).
 */
interface DistributeContext {
  startIndex: number;
  ids: readonly (string | null)[];
  payerId: string | null;
}

/**
 * THE rounding seam: turns one amount into whole cents across weighted recipients. Every
 * item split, every adjustment split and `previewItemSplit` goes through this one function.
 * Σ result === amount, always, and it's deterministic.
 *
 * - **The payer is a recipient** (spec §5.2, "Rounding with a payer"): every other recipient,
 *   the unclaimed pseudo-participant included, gets their exact share rounded to the
 *   nearest cent (halves away from zero), and the payer gets the rest. Nobody's amount then
 *   depends on anyone else's weight except the payer's, so claiming an item moves only the
 *   claimant, the payer and `unclaimed`.
 * - **Otherwise** (no payer, or the payer isn't in this split): the pinned largest-remainder
 *   rule, ties rotating from `startIndex` (`allocate`).
 */
function distribute(amount: Cents, weights: readonly number[], ctx: DistributeContext): Cents[] {
  const payerIndex = ctx.payerId === null ? -1 : ctx.ids.indexOf(ctx.payerId);
  return payerIndex < 0 ? allocate(amount, [...weights], ctx.startIndex) : payerAbsorbs(amount, weights, payerIndex);
}

/**
 * Nearest-cent shares for everyone but `payerIndex`; the payer takes amount − Σ others.
 * Exact integer arithmetic: round(a·w / W) via remainder, `(x − x mod W) / W`, never a float
 * quotient. A negative amount splits |amount| and negates (so halves round away from zero
 * either way). W = 0 → all zeros, like `allocate` (the caller picks the fallback).
 */
function payerAbsorbs(amount: Cents, weights: readonly number[], payerIndex: number): Cents[] {
  const W = sum(weights);
  if (W === 0 || amount === 0) return weights.map(() => 0);
  const a = Math.abs(amount);
  if (!Number.isSafeInteger(a * W)) throw new RangeError(`split: amount × Σ weights exceeds 2^53 (${a} × ${W})`);
  const shares = weights.map((w, i) => {
    if (i === payerIndex) return 0;
    const product = a * w;
    const rem = product % W;
    return (product - rem) / W + (rem * 2 >= W ? 1 : 0);
  });
  shares[payerIndex] = a - sum(shares);
  return amount < 0 ? shares.map(negate) : shares;
}

/**
 * The claimants of one item, in `people` order (the tie-break order, spec §4), with their
 * shares. Claims for an id that isn't on `people` (and any share that isn't a positive
 * integer; 0 is never stored) are ignored, so they can never swallow money: an item whose
 * only claims are stale is simply unclaimed.
 */
function claimantsOf(claims: Record<string, number>, people: readonly Person[]): { personId: string; shares: number }[] {
  const out: { personId: string; shares: number }[] = [];
  for (const p of people) {
    const shares = Object.prototype.hasOwnProperty.call(claims, p.id) ? claims[p.id] : undefined;
    if (shares !== undefined && Number.isSafeInteger(shares) && shares > 0) out.push({ personId: p.id, shares });
  }
  return out;
}

/** One item's split (spec §5.3): `distribute(price, shares, startIndex = itemIndex)` across claimants. */
function splitItem(
  priceCents: Cents,
  claims: Record<string, number>,
  people: readonly Person[],
  itemIndex: number,
  payerId: string | null,
) {
  const claimants = claimantsOf(claims, people);
  const shares = claimants.map((c) => c.shares);
  const cents = distribute(priceCents, shares, { startIndex: itemIndex, ids: claimants.map((c) => c.personId), payerId });
  const totalShares = sum(shares);
  return claimants.map((c, i) => ({ ...c, totalShares, cents: cents[i] }));
}

/**
 * Live preview for `ItemSplitSheet`: what each claimant would pay for one item. It is the
 * SAME allocation `computeSplit` runs for item `itemIndex`, so the preview can never disagree
 * with the engine. Keys are the claimants' person ids (people not claiming are absent).
 *
 * Pass the bill's `paidBy`: when the payer is one of the claimants, the payer absorbs the
 * rounding (spec §5.2), exactly as in `computeSplit`. An id not on `people` counts as no
 * payer. Omitted → no payer (the largest-remainder rule).
 */
export function previewItemSplit(
  priceCents: Cents,
  claims: Record<string, number>,
  people: Person[],
  itemIndex: number,
  paidBy: string | null = null,
): Record<string, Cents> {
  const payer = paidBy !== null && people.some((p) => p.id === paidBy) ? paidBy : null;
  const out: Record<string, Cents> = {};
  for (const line of splitItem(priceCents, claims, people, itemIndex, payer)) out[line.personId] = line.cents;
  return out;
}

function itemsSubtotal(items: readonly Item[]): Cents {
  let s = 0;
  for (const item of items) s += item.priceCents;
  return s;
}

function amountOf(adj: Adjustment, base: Cents): Cents {
  return adj.value.type === "amount" ? adj.value.cents : percentOf(base, adj.value.bps);
}

function resolved(adj: Adjustment, cents: Cents): ResolvedAdjustment {
  return { id: adj.id, kind: adj.kind, label: adj.label, cents };
}

/**
 * Resolve every adjustment to signed cents, in spec §5.4 order: discounts, then tax, then
 * fees, then tip (bill order within a kind). With S = the items subtotal (claimed or not):
 *
 * 1. Discounts: −amount or −percentOf(S). Their total D is clamped to D ≥ −S. The shortfall
 *    comes off the last discount; if the last one is smaller than the shortfall, the rest
 *    comes off the one before it, and so on (no discount ever turns positive).
 * 2. Tax: amount or percentOf(S + D). Total T.
 * 3. Fees: amount or percentOf(S + D). Total F.
 * 4. Tip: amount, or percentOf(S) for `pretax` (the default), percentOf(S + D + T + F) for
 *    `posttax`.
 */
export function resolveAdjustments(bill: Bill): ResolvedAdjustment[] {
  const S = itemsSubtotal(bill.items);
  const ofKind = (kind: Adjustment["kind"]) => bill.adjustments.filter((a) => a.kind === kind);

  const discounts = ofKind("discount").map((a) => negate(amountOf(a, S)));
  let excess = negate(sum(discounts)) - S; // how far D overshoots −S
  for (let i = discounts.length - 1; i >= 0 && excess > 0; i--) {
    const take = Math.min(excess, negate(discounts[i]));
    discounts[i] = negate(negate(discounts[i]) - take);
    excess -= take;
  }
  const D = sum(discounts);

  const taxes = ofKind("tax").map((a) => amountOf(a, S + D));
  const T = sum(taxes);
  const fees = ofKind("fee").map((a) => amountOf(a, S + D));
  const F = sum(fees);
  const tips = ofKind("tip").map((a) => amountOf(a, (a.basis ?? "pretax") === "posttax" ? S + D + T + F : S));

  return [
    ...ofKind("discount").map((a, i) => resolved(a, discounts[i])),
    ...ofKind("tax").map((a, i) => resolved(a, taxes[i])),
    ...ofKind("fee").map((a, i) => resolved(a, fees[i])),
    ...ofKind("tip").map((a, i) => resolved(a, tips[i])),
  ];
}

const COMPONENT = {
  discount: "discountCents",
  tax: "taxCents",
  fee: "feeCents",
  tip: "tipCents",
} as const satisfies Record<Adjustment["kind"], keyof PersonResult>;

/**
 * Split a bill (spec §5). Items are allocated across their claimants by shares; each
 * resolved adjustment j is then allocated with tie-break `startIndex = items.length + j`
 * (j is its index in `SplitResult.adjustments`, i.e. §5.4 order):
 *
 * - `proportional`: weights are each person's items subtotal, plus an "unclaimed"
 *   pseudo-participant weighted by the unclaimed items; its portion lands in
 *   `unclaimed.totalCents`. If every weight is 0, it falls back to equal.
 * - `equal`: weight 1 for every person on the bill (the pseudo-participant takes no part).
 * - No people: nothing is allocated; everything is unclaimed.
 *
 * Rounding: with a payer among a split's recipients, the payer absorbs it (`distribute`).
 *
 * Invariant (property-tested): Σ people.totalCents + unclaimed.totalCents === grandTotalCents.
 */
export function computeSplit(bill: Bill): SplitResult {
  const { people, items } = bill;
  const index = new Map(people.map((p, i) => [p.id, i]));
  const payer = bill.paidBy !== null && index.has(bill.paidBy) ? bill.paidBy : null;
  const settled = new Set(bill.settled);

  const results: PersonResult[] = people.map((p) => ({
    personId: p.id,
    lines: [] as PersonLine[],
    subtotalCents: 0,
    discountCents: 0,
    taxCents: 0,
    feeCents: 0,
    tipCents: 0,
    totalCents: 0,
    owesTo: payer !== null && p.id !== payer ? payer : null,
    settled: settled.has(p.id),
  }));

  // §5.3 Items.
  const unclaimed = { itemIds: [] as string[], itemsCents: 0, totalCents: 0 };
  items.forEach((item, itemIndex) => {
    const lines = splitItem(item.priceCents, item.claims, people, itemIndex, payer);
    if (lines.length === 0) {
      unclaimed.itemIds.push(item.id);
      unclaimed.itemsCents += item.priceCents;
      return;
    }
    for (const line of lines) {
      const r = results[index.get(line.personId)!];
      r.lines.push({ itemId: item.id, name: item.name, shares: line.shares, totalShares: line.totalShares, cents: line.cents });
      r.subtotalCents += line.cents;
    }
  });
  unclaimed.totalCents = unclaimed.itemsCents;

  // §5.4 resolution, §5.5 allocation.
  const adjustments = resolveAdjustments(bill);
  const modeOf = new Map(bill.adjustments.map((a) => [a.id, a.split ?? "proportional"]));
  const subtotals = results.map((r) => r.subtotalCents);
  const personIds = people.map((p) => p.id);
  const equalWeights = people.map(() => 1);
  const proportionalWeights = [...subtotals, unclaimed.itemsCents];
  const proportionalIds = [...personIds, null];
  const proportionalUsable = sum(proportionalWeights) > 0;

  adjustments.forEach((adj, j) => {
    if (people.length === 0) {
      unclaimed.totalCents += adj.cents;
      return;
    }
    const startIndex = items.length + j;
    const field = COMPONENT[adj.kind];
    const proportional = modeOf.get(adj.id) !== "equal" && proportionalUsable;
    const shares = proportional
      ? distribute(adj.cents, proportionalWeights, { startIndex, ids: proportionalIds, payerId: payer })
      : distribute(adj.cents, equalWeights, { startIndex, ids: personIds, payerId: payer });
    results.forEach((r, i) => (r[field] += shares[i]));
    if (proportional) unclaimed.totalCents += shares[people.length];
  });

  for (const r of results) r.totalCents = r.subtotalCents + r.discountCents + r.taxCents + r.feeCents + r.tipCents;

  const S = itemsSubtotal(items);
  const adjustmentsTotal = sum(adjustments.map((a) => a.cents));
  const beforeTip = S + sum(adjustments.filter((a) => a.kind !== "tip").map((a) => a.cents));
  const { subtotalCents: printedSubtotal, totalCents: printedTotal } = bill.printed;

  return {
    people: results,
    itemsSubtotalCents: S,
    adjustments,
    grandTotalCents: S + adjustmentsTotal,
    unclaimed,
    status: items.length === 0 ? "empty" : unclaimed.itemIds.length > 0 ? "unclaimed" : "balanced",
    printed: {
      subtotalDiffCents: printedSubtotal === undefined ? null : S - printedSubtotal,
      totalDiffCents: printedTotal === undefined ? null : beforeTip - printedTotal,
    },
  };
}
