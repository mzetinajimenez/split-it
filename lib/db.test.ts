import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBill, writeBillRow } from "../e2e/helpers/seed";
import { db, DB_NAME, DEFAULT_SETTINGS, ensureSeeded, IDB_VERSION, SCHEMA_VERSION, STORES_V1 } from "./db";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function reset() {
  db.close();
  await db.delete();
  await db.open();
}

beforeEach(reset);
afterEach(() => db.close());

describe("schema v1", () => {
  it("is version 1 with the spec's tables and indexes", async () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(db.verno).toBe(1);
    expect(db.name).toBe(DB_NAME);
    expect(STORES_V1).toEqual({ bills: "id, date, updatedAt, deletedAt", settings: "id", meta: "id" });
    const bills = db.table("bills").schema;
    expect(bills.primKey.keyPath).toBe("id");
    expect(bills.indexes.map((i) => i.name).sort()).toEqual(["date", "deletedAt", "updatedAt"]);
    expect(db.table("settings").schema.primKey.keyPath).toBe("id");
    expect(db.table("meta").schema.primKey.keyPath).toBe("id");
    expect(db.tables.map((t) => t.name).sort()).toEqual(["bills", "meta", "settings"]);
  });

  it("opens the raw IndexedDB at version SCHEMA_VERSION × 10", async () => {
    expect(IDB_VERSION).toBe(10);
    expect(db.backendDB().version).toBe(IDB_VERSION);
  });
});

describe("ensureSeeded", () => {
  it("creates meta and the default settings on first run", async () => {
    await ensureSeeded();
    const meta = await db.meta.get("meta");
    expect(meta).toMatchObject({ id: "meta", schemaVersion: SCHEMA_VERSION });
    expect(meta!.installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta!.createdAt).toBe(meta!.updatedAt);
    const settings = await db.settings.get("settings");
    expect(settings).toMatchObject({ id: "settings", currency: "USD", defaultTip: { bps: 2000, basis: "pretax" } });
    expect(DEFAULT_SETTINGS.defaultTip).toEqual({ bps: 2000, basis: "pretax" });
  });

  it("is idempotent: a second run changes nothing", async () => {
    await ensureSeeded();
    const meta = await db.meta.get("meta");
    await db.settings.update("settings", { currency: "EUR" });
    await ensureSeeded();
    expect(await db.meta.get("meta")).toEqual(meta);
    expect((await db.settings.get("settings"))!.currency).toBe("EUR");
    expect(await db.meta.count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
  });

  it("seeds exactly once when called concurrently", async () => {
    await Promise.all([ensureSeeded(), ensureSeeded(), ensureSeeded()]);
    expect(await db.meta.count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
  });

  it("re-seeds after meta and settings are cleared together", async () => {
    await ensureSeeded();
    const first = (await db.meta.get("meta"))!.installId;
    await db.transaction("rw", db.meta, db.settings, async () => {
      await db.meta.clear();
      await db.settings.clear();
    });
    await ensureSeeded();
    expect((await db.meta.get("meta"))!.installId).not.toBe(first);
    expect(await db.settings.get("settings")).toBeDefined();
  });
});

describe("e2e seed helper (writeBillRow)", () => {
  it("creates the v1 stores on a fresh database in a shape Dexie opens and reads", async () => {
    db.close();
    await db.delete();
    const bill = buildBill({ title: "Tacos" });
    await writeBillRow({ dbName: DB_NAME, version: IDB_VERSION, stores: { ...STORES_V1 }, bill });
    await db.open();
    expect(db.verno).toBe(1);
    expect(await db.bills.get(bill.id)).toEqual(bill);
    expect(await db.bills.where("date").equals(bill.date).count()).toBe(1);
    // ensureSeeded still works on a database the helper created.
    await ensureSeeded();
    expect(await db.meta.count()).toBe(1);
  });

  it("writes into a database Dexie already created", async () => {
    await ensureSeeded();
    db.close();
    const bill = buildBill();
    await writeBillRow({ dbName: DB_NAME, version: IDB_VERSION, stores: { ...STORES_V1 }, bill });
    await db.open();
    expect(await db.bills.get(bill.id)).toEqual(bill);
    expect(await db.meta.count()).toBe(1);
  });

  it("buildBill fills createBill's defaults and validates", () => {
    const bill = buildBill();
    expect(bill).toMatchObject({
      title: "Untitled bill",
      currency: "USD",
      people: [],
      items: [],
      printed: {},
      paidBy: null,
      settled: [],
      deletedAt: null,
    });
    expect(bill.adjustments).toEqual([
      expect.objectContaining({ kind: "tip", value: { type: "percent", bps: 2000 }, basis: "pretax" }),
    ]);
    expect(() => buildBill({ items: [{ id: "i", name: "", quantity: 1, priceCents: 1, claims: {} }] })).toThrow();
  });
});

// ---------------------------------------------------------------------------------------
// Storage-seam contract: only the write path and the read path touch Dexie.
// ---------------------------------------------------------------------------------------

/** Files allowed to import lib/db.ts or Dexie directly. */
const DB_IMPORTERS = new Set(["lib/repo.ts", "lib/hooks.ts", "lib/db.ts"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** Every module specifier a source file imports. */
function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1]);
}

const isDbModule = (spec: string) => /^(?:@\/lib\/db|(?:\.\.?\/)+(?:lib\/)?db)(?:\.ts)?$/.test(spec);
const isDexie = (spec: string) => spec === "dexie" || spec.startsWith("dexie/");

describe("storage seam contract", () => {
  it("recognises the import forms it polices", () => {
    expect(importsOf(`import { db } from "@/lib/db";`)).toEqual(["@/lib/db"]);
    expect(importsOf(`const m = await import('../lib/db')`)).toEqual(["../lib/db"]);
    expect(importsOf(`import Dexie from "dexie"`)).toEqual(["dexie"]);
    expect(isDbModule("@/lib/db")).toBe(true);
    expect(isDbModule("./db")).toBe(true);
    expect(isDbModule("../../lib/db")).toBe(true);
    expect(isDbModule("@/lib/dbx")).toBe(false);
    expect(isDbModule("./schemas")).toBe(false);
    expect(isDexie("dexie")).toBe(true);
    expect(isDexie("dexie-react-hooks")).toBe(false);
  });

  it("no file in app/ or lib/ outside repo.ts / hooks.ts imports lib/db.ts or Dexie", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "lib"]) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (DB_IMPORTERS.has(rel)) continue;
        for (const spec of importsOf(readFileSync(file, "utf8"))) {
          if (isDbModule(spec) || isDexie(spec)) offenders.push(`${rel} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
