// e2e/helpers/seed.ts: write a complete Bill row straight into the app's IndexedDB, so a
// screen's e2e test can start on `/bills/<id>/…` without driving the Bills home (#15).
//
//   const id = await seedBill(page, { title: "Tacos", people: [...], items: [...] });
//   await page.goto(`/bills/${id}/split`);
//
// The row is built and zod-validated here in Node (an invalid fixture fails loudly, before
// the browser is involved), then written with the raw `indexedDB` API inside
// `page.evaluate`, using the database name, version and v1 stores from lib/db.ts.

import type { Page } from "@playwright/test";
import { DB_NAME, IDB_VERSION, STORES_V1 } from "../../lib/db";
import { billSchema } from "../../lib/schemas";
import type { Bill } from "../../lib/types";

export type SeedArgs = {
  dbName: string;
  version: number;
  stores: Record<string, string>;
  bill: Bill;
};

/**
 * Runs IN THE BROWSER (via page.evaluate), so it must be self-contained: no imports, no
 * closures over module scope. Opens the database at Dexie's version, creating the v1 stores
 * exactly as Dexie would if the app hasn't opened it yet, and puts the bill row.
 */
export function writeBillRow({ dbName, version, stores, bill }: SeedArgs): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const idb = req.result;
      for (const [name, spec] of Object.entries(stores)) {
        if (idb.objectStoreNames.contains(name)) continue;
        const [primary, ...indexes] = spec.split(",").map((s) => s.trim()).filter(Boolean);
        const store = idb.createObjectStore(name, { keyPath: primary });
        for (const index of indexes) store.createIndex(index, index);
      }
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`seedBill: opening ${dbName} was blocked`));
    req.onsuccess = () => {
      const idb = req.result;
      const tx = idb.transaction("bills", "readwrite");
      tx.objectStore("bills").put(bill);
      tx.oncomplete = () => {
        idb.close();
        resolve();
      };
      tx.onerror = () => {
        idb.close();
        reject(tx.error);
      };
    };
  });
}

/** Today's local date, YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A complete, valid Bill: `partial` over the same defaults as `createBill` (title
 * "Untitled bill", today, USD, a 20% pre-tax proportional tip, no people or items).
 * Throws a ZodError if the result isn't a valid bill.
 */
export function buildBill(partial: Partial<Bill> = {}): Bill {
  const ts = new Date().toISOString();
  return billSchema.parse({
    id: crypto.randomUUID(),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    title: "Untitled bill",
    date: today(),
    currency: "USD",
    people: [],
    items: [],
    adjustments: [
      {
        id: crypto.randomUUID(),
        kind: "tip",
        label: "Tip",
        value: { type: "percent", bps: 2000 },
        basis: "pretax",
        split: "proportional",
      },
    ],
    printed: {},
    paidBy: null,
    settled: [],
    ...partial,
  });
}

/**
 * Open the app, write a complete Bill row (`partial` over createBill's defaults) into its
 * IndexedDB, and return the bill's id. Navigate to the screen under test afterwards.
 */
export async function seedBill(page: Page, partial: Partial<Bill> = {}): Promise<string> {
  const bill = buildBill(partial);
  if (!/^https?:/.test(page.url())) await page.goto("/");
  await page.evaluate(writeBillRow, { dbName: DB_NAME, version: IDB_VERSION, stores: { ...STORES_V1 }, bill });
  return bill.id;
}
