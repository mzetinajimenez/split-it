// lib/db.ts: the Dexie schema, the storage seam (spec §4).
//
// Only lib/repo.ts (the write path) and lib/hooks.ts (the read path) may import this file;
// lib/db-contract.test.ts enforces that.
//
// MIGRATIONS ARE ADDITIVE-ONLY. A schema change adds a NEW `db.version(N)` block below and
// bumps SCHEMA_VERSION. Never edit the `version(1)` block, drop a table or remove an index:
// users' data lives in their browser, and a destructive migration silently eats it.

import Dexie, { type EntityTable } from "dexie";
import type { Bill, Meta, Settings } from "./types";

/** IndexedDB database name. e2e/helpers/seed.ts opens the same database with the raw API. */
export const DB_NAME = "split-it";

/** The latest `db.version(N)`. Also stamped on the `meta` row and on backups. */
export const SCHEMA_VERSION = 1;

/**
 * Dexie stores `db.version(N)` as IndexedDB version N × 10. A raw `indexedDB.open` (the
 * e2e seed helper) must use this number, or it either fails with a VersionError or
 * upgrades the database behind Dexie's back.
 */
export const IDB_VERSION = SCHEMA_VERSION * 10;

/** The v1 store definitions, exactly as passed to `db.version(1).stores()`. */
export const STORES_V1 = {
  bills: "id, date, updatedAt, deletedAt",
  settings: "id",
  meta: "id",
} as const;

export type SplitItDB = Dexie & {
  bills: EntityTable<Bill, "id">;
  settings: EntityTable<Settings, "id">;
  meta: EntityTable<Meta, "id">;
};

export const db = new Dexie(DB_NAME) as SplitItDB;

db.version(1).stores(STORES_V1);

/** The default `settings` row's values (spec §4): USD, a 20% pre-tax tip. */
export const DEFAULT_SETTINGS: Omit<Settings, "updatedAt"> = {
  id: "settings",
  currency: "USD",
  defaultTip: { bps: 2000, basis: "pretax" },
};

/**
 * First-run seeding: creates the singleton `meta` row and the default `settings` row, once.
 * Idempotent and race-safe: the check and the writes share one rw transaction, and IndexedDB
 * serialises overlapping rw transactions, so concurrent calls seed exactly once.
 *
 * "First run" is keyed off `meta`. Any "clear all data" path must clear and re-seed `meta`
 * and `settings` together (CLAUDE.md).
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction("rw", db.meta, db.settings, async () => {
    if (await db.meta.get("meta")) return;
    const now = new Date().toISOString();
    await db.meta.add({
      id: "meta",
      schemaVersion: SCHEMA_VERSION,
      installId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    if (!(await db.settings.get("settings"))) {
      await db.settings.add({ ...DEFAULT_SETTINGS, defaultTip: { ...DEFAULT_SETTINGS.defaultTip }, updatedAt: now });
    }
  });
}
