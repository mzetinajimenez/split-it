// lib/hooks.ts: THE READ PATH (spec §4 "Read hooks").
//
// Two layers:
// - plain async query functions (`query*`), framework-free and unit-tested against
//   fake-indexeddb in lib/hooks.test.ts;
// - thin `use*` hooks that wrap each query in `useLiveQuery`, so a component re-renders
//   whenever the rows it read change. They return `undefined` while loading.
//
// Every read filters tombstones (`deletedAt !== null`). Splits are derived here at read time
// (`computeSplit`) and never stored. Components read through these hooks and never import
// Dexie or lib/db.ts (the storage-seam contract in lib/db.test.ts).

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, DEFAULT_SETTINGS, ensureSeeded } from "./db";
import { computeSplit } from "./split";
import type { Bill, Cents, Settings, SplitResult } from "./types";

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

/** One row of the Bills history (spec §8 "/ Bills"), derived from the bill document. */
export interface BillListEntry {
  bill: Bill;
  /** `computeSplit(bill).grandTotalCents`. */
  totalCents: Cents;
  /** Number of unclaimed items (`computeSplit(bill).unclaimed.itemIds.length`). */
  unclaimedCount: number;
  /** Number of people on the bill marked "paid back". */
  settledCount: number;
  /** `computeSplit(bill).status`. */
  status: SplitResult["status"];
}

/** How many of the newest bills `queryRecentPeople` looks through. */
export const RECENT_PEOPLE_BILLS = 20;

/** `useRecentPeople`'s default limit. */
export const RECENT_PEOPLE_LIMIT = 12;

// ---------------------------------------------------------------------------------------
// Query functions (framework-free)
// ---------------------------------------------------------------------------------------

const isLive = (bill: Bill) => bill.deletedAt === null;

/** Newest first: `date` desc, then `updatedAt` desc. Both are fixed-width ISO strings. */
function byRecency(a: Bill, b: Bill): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return 0;
}

/**
 * Every live bill, newest first. IndexedDB doesn't index `null`, so tombstones are filtered
 * in memory rather than via the `deletedAt` index; a history is small.
 */
async function liveBills(): Promise<Bill[]> {
  const bills = await db.bills.filter(isLive).toArray();
  return bills.sort(byRecency);
}

/** Every stored bill row, tombstones included. For backup export only. */
export async function queryAllBillRows(): Promise<Bill[]> {
  return db.bills.toArray();
}

/** The Bills history: live bills sorted by `date` desc, then `updatedAt` desc. */
export async function queryBills(): Promise<BillListEntry[]> {
  return (await liveBills()).map((bill) => {
    const split = computeSplit(bill);
    return {
      bill,
      totalCents: split.grandTotalCents,
      unclaimedCount: split.unclaimed.itemIds.length,
      settledCount: split.people.filter((p) => p.settled).length,
      status: split.status,
    };
  });
}

/** One bill, or `null` when it doesn't exist or is tombstoned. */
export async function queryBill(id: string): Promise<Bill | null> {
  const bill = await db.bills.get(id);
  return bill && isLive(bill) ? bill : null;
}

/** One bill and its derived split, or `null` when the bill is missing or tombstoned. */
export async function querySplit(id: string): Promise<{ bill: Bill; split: SplitResult } | null> {
  const bill = await queryBill(id);
  return bill ? { bill, split: computeSplit(bill) } : null;
}

/**
 * Distinct people names across the newest `RECENT_PEOPLE_BILLS` live bills, most recent
 * first (bill recency, then each bill's people order). Dedupe is case-insensitive and keeps
 * the most recent casing. At most `limit` names.
 */
export async function queryRecentPeople(limit: number = RECENT_PEOPLE_LIMIT): Promise<string[]> {
  const bills = (await liveBills()).slice(0, RECENT_PEOPLE_BILLS);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const bill of bills) {
    for (const person of bill.people) {
      if (names.length >= limit) return names;
      const name = person.name.trim();
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * The settings row. Falls back to the defaults if it hasn't been seeded yet (a read can race
 * `useDbInit`'s first-run seeding), so callers always get a complete `Settings`.
 */
export async function querySettings(): Promise<Settings> {
  const settings = await db.settings.get("settings");
  return settings ?? { ...DEFAULT_SETTINGS, defaultTip: { ...DEFAULT_SETTINGS.defaultTip }, updatedAt: "" };
}

// ---------------------------------------------------------------------------------------
// Hooks (useLiveQuery wrappers): `undefined` while loading
// ---------------------------------------------------------------------------------------

export function useBills(): BillListEntry[] | undefined {
  return useLiveQuery(queryBills, []);
}

/** `undefined` = loading, `null` = missing or deleted. */
export function useBill(id: string): Bill | null | undefined {
  return useLiveQuery(() => queryBill(id), [id]);
}

/** The bill and its split, recomputed inside the live query on every change to the bill. */
export function useSplit(id: string): { bill: Bill; split: SplitResult } | null | undefined {
  return useLiveQuery(() => querySplit(id), [id]);
}

export function useRecentPeople(limit: number = RECENT_PEOPLE_LIMIT): string[] | undefined {
  return useLiveQuery(() => queryRecentPeople(limit), [limit]);
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(querySettings, []);
}

// ---------------------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------------------

let initPromise: Promise<void> | null = null;

/**
 * First-run init, exactly once per page load however many times it is called: seeds `meta`
 * + `settings` and asks for persistent storage (best-effort: a refusal or a missing API
 * never fails init). Exported for tests; components use `useDbInit`.
 */
export function initDb(): Promise<void> {
  initPromise ??= (async () => {
    await ensureSeeded();
    try {
      if (typeof navigator !== "undefined" && navigator.storage?.persist) {
        await navigator.storage.persist();
      }
    } catch {
      // Best-effort: browsers may refuse or throw; the app works without persistence.
    }
  })().catch((err: unknown) => {
    initPromise = null; // allow a retry on the next mount
    throw err;
  });
  return initPromise;
}

/** Test-only: forget the memoised init so the next `initDb()` runs again. */
export function resetDbInitForTests(): void {
  initPromise = null;
}

/** Runs `initDb()` once on mount; `true` once the database is seeded. */
export function useDbInit(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    initDb().then(
      () => {
        if (!cancelled) setReady(true);
      },
      (err: unknown) => {
        console.error("split-it: database init failed", err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
