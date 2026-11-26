import { expect, test } from "@playwright/test";
import { DB_NAME } from "../lib/db";
import { seedBill } from "./helpers/seed";

// Proves e2e/helpers/seed.ts before the wave-5 screen issues depend on it: a seeded bill
// lands in the app's IndexedDB and a bill route loads with it in place, without crashing.
test("seedBill writes a bill the app can load", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const id = await seedBill(page, {
    title: "Tacos",
    people: [{ id: "p-alex", name: "Alex", colorIndex: 0 }],
    items: [{ id: "i-tacos", name: "Tacos", quantity: 1, priceCents: 1800, claims: { "p-alex": 1 } }],
  });
  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  const response = await page.goto(`/bills/${id}/receipt`);
  expect(response?.status() ?? 0).toBeLessThan(500);
  await page.waitForLoadState("networkidle");

  const stored = await page.evaluate(
    ({ dbName, billId }) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction("bills").objectStore("bills").get(billId);
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    { dbName: DB_NAME, billId: id },
  );
  expect(stored).toMatchObject({ id, title: "Tacos", deletedAt: null, items: [{ name: "Tacos", priceCents: 1800 }] });
  expect(errors).toEqual([]);
});
