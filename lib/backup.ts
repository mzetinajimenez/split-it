// lib/backup.ts: export / parse / summarize / import a whole-device backup (spec §4 Settings).
// Framework-free. Database access goes through hooks.ts (read) and repo.ts (write), never db.
//
// FORWARD MIGRATION: a backup carries the `schemaVersion` it was written at. Before the first
// `db.version(2)` lands, `migrateBackup` below MUST upgrade every older schemaVersion's rows to
// the current shape (additively) before they're validated; a NEWER schemaVersion is rejected
// as "from a newer version". Today there is only v1, so the migration is the identity.

import { z } from "zod";
import { queryAllBillRows, querySettings } from "./hooks";
import { replaceAllData, SCHEMA_VERSION } from "./repo";
import { billSchema, settingsSchema } from "./schemas";
import type { Bill, Settings } from "./types";

export const BACKUP_APP = "split-it";

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  bills: Bill[];
  settings: Settings;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

const envelopeSchema = z.object({
  app: z.literal(BACKUP_APP, { error: "This file isn't a split-it backup." }),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.iso.datetime(),
  bills: z.array(z.unknown()),
  settings: z.unknown(),
});

/** Upgrade older rows to the current shape. Identity while SCHEMA_VERSION is 1. */
function migrateBackup(raw: { schemaVersion: number; bills: unknown[]; settings: unknown }) {
  return { bills: raw.bills, settings: raw.settings };
}

export async function exportBackup(): Promise<Blob> {
  const backup: Backup = {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    bills: await queryAllBillRows(),
    settings: await querySettings(),
  };
  return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
}

/** Parse and validate backup JSON text. Throws BackupError with a user-facing message. */
export function parseBackup(json: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError("This file isn't valid JSON.");
  }
  const env = envelopeSchema.safeParse(data);
  if (!env.success) {
    const wrongApp = typeof data !== "object" || data === null || (data as { app?: unknown }).app !== BACKUP_APP;
    throw new BackupError(wrongApp ? "This file isn't a split-it backup." : "This backup file is malformed.");
  }
  if (env.data.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError("This backup is from a newer version of split-it. Update the app and try again.");
  }
  const migrated = migrateBackup(env.data);
  const bills = z.array(billSchema).safeParse(migrated.bills);
  const settings = settingsSchema.safeParse(migrated.settings);
  if (!bills.success || !settings.success) throw new BackupError("This backup has damaged data and wasn't imported.");
  if (new Set(bills.data.map((b) => b.id)).size !== bills.data.length) {
    throw new BackupError("This backup has damaged data and wasn't imported.");
  }
  return {
    app: BACKUP_APP,
    schemaVersion: env.data.schemaVersion,
    exportedAt: env.data.exportedAt,
    bills: bills.data,
    settings: settings.data,
  };
}

export interface BackupSummary {
  billCount: number;
  /** Latest bill date, YYYY-MM-DD, or null with no live bills. */
  lastDate: string | null;
  text: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 bills, last on Nov 25". Counts live bills only (tombstones restore but aren't shown). */
export function summarizeBackup(b: Backup): BackupSummary {
  const live = b.bills.filter((x) => x.deletedAt === null);
  const lastDate = live.reduce<string | null>((m, x) => (m === null || x.date > m ? x.date : m), null);
  const noun = `${live.length} ${live.length === 1 ? "bill" : "bills"}`;
  let text = noun;
  if (lastDate) {
    const [, m, d] = lastDate.split("-").map(Number);
    text = `${noun}, last on ${MONTHS[m - 1]} ${d}`;
  }
  return { billCount: live.length, lastDate, text };
}

/** Replace bills and settings in one transaction. Never touches `meta`. */
export async function importBackup(b: Backup): Promise<void> {
  await replaceAllData({ bills: b.bills, settings: b.settings });
}
