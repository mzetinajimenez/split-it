import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBill } from "../e2e/helpers/seed";
import { BackupError, exportBackup, importBackup, parseBackup, summarizeBackup } from "./backup";
import { db, ensureSeeded, SCHEMA_VERSION } from "./db";
import { queryAllBillRows, querySettings } from "./hooks";
import { clearAllData, createBill, updateSettings } from "./repo";

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await ensureSeeded();
});
afterEach(() => db.close());

const exported = async () => parseBackup(await (await exportBackup()).text());

describe("backup round trip", () => {
  it("exports bills (tombstones included) + settings and restores them exactly", async () => {
    await updateSettings({ currency: "EUR", defaultTip: { bps: 1800, basis: "pretax" } });
    await db.bills.bulkAdd([
      buildBill({ id: "a", date: "2026-11-20" }),
      buildBill({ id: "b", date: "2026-11-25", deletedAt: "2026-11-26T00:00:00.000Z" }),
    ]);
    const blob = await exportBackup();
    const backup = parseBackup(await blob.text());
    expect(backup).toMatchObject({ app: "split-it", schemaVersion: SCHEMA_VERSION });
    expect(backup.bills.map((b) => b.id).sort()).toEqual(["a", "b"]);

    const before = { bills: await queryAllBillRows(), settings: await querySettings() };
    await clearAllData();
    expect(await queryAllBillRows()).toEqual([]);
    await importBackup(backup);
    expect(await queryAllBillRows()).toEqual(before.bills);
    expect(await querySettings()).toEqual(before.settings);
  });

  it("replaces existing bills", async () => {
    await createBill({ title: "Old" });
    const backup = await exported();
    await createBill({ title: "Newer" });
    await importBackup(backup);
    expect((await queryAllBillRows()).map((b) => b.title)).toEqual(["Old"]);
  });

  it("leaves meta untouched", async () => {
    const meta = await db.meta.get("meta");
    await importBackup(await exported());
    expect(await db.meta.get("meta")).toEqual(meta);
  });
});

describe("parseBackup rejects", () => {
  const good = async () => JSON.parse(await (await exportBackup()).text());
  it("non-JSON", () => expect(() => parseBackup("nope")).toThrow(BackupError));
  it("another app", async () => {
    const b = await good();
    expect(() => parseBackup(JSON.stringify({ ...b, app: "savor" }))).toThrow(/isn't a split-it backup/);
    expect(() => parseBackup("[]")).toThrow(/isn't a split-it backup/);
  });
  it("a newer schema", async () => {
    const b = await good();
    expect(() => parseBackup(JSON.stringify({ ...b, schemaVersion: SCHEMA_VERSION + 1 }))).toThrow(/newer version/);
  });
  it("malformed rows", async () => {
    const b = await good();
    const bad = { ...b, bills: [{ id: "x", title: "" }] };
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/damaged/);
    expect(() => parseBackup(JSON.stringify({ ...b, settings: { id: "settings" } }))).toThrow(/damaged/);
  });
  it("duplicate bill ids", async () => {
    const b = await good();
    const row = buildBill({ id: "dup" });
    expect(() => parseBackup(JSON.stringify({ ...b, bills: [row, row] }))).toThrow(/damaged/);
  });
});

describe("summarizeBackup", () => {
  it("counts live bills and names the latest date", async () => {
    await db.bills.bulkAdd([
      buildBill({ id: "a", date: "2026-11-20" }),
      buildBill({ id: "b", date: "2026-11-25" }),
      buildBill({ id: "c", date: "2026-12-01", deletedAt: "2026-12-02T00:00:00.000Z" }),
    ]);
    expect(summarizeBackup(await exported()).text).toBe("2 bills, last on Nov 25");
  });
  it("handles none and one", async () => {
    expect(summarizeBackup(await exported()).text).toBe("0 bills");
    await db.bills.add(buildBill({ id: "a", date: "2026-01-05" }));
    expect(summarizeBackup(await exported()).text).toBe("1 bill, last on Jan 5");
  });
});

describe("clearAllData", () => {
  it("clears bills, meta and settings together and re-seeds", async () => {
    await createBill();
    await updateSettings({ currency: "EUR" });
    const oldInstall = (await db.meta.get("meta"))!.installId;
    await clearAllData();
    expect(await db.bills.count()).toBe(0);
    expect((await querySettings()).currency).toBe("USD");
    expect(await db.settings.count()).toBe(1);
    expect((await db.meta.get("meta"))!.installId).not.toBe(oldInstall);
  });
});
