import { expect, test, type Page } from "@playwright/test";
import { seedBill } from "./helpers/seed";

/** Live (non-tombstoned) bills straight from IndexedDB. */
async function storedBills(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ title: string; deletedAt: string | null; adjustments: { kind: string; value: { bps?: number } }[] }[]>(
        (resolve, reject) => {
          const req = indexedDB.open("split-it");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const all = req.result.transaction("bills").objectStore("bills").getAll();
            all.onsuccess = () => {
              req.result.close();
              resolve(all.result);
            };
          };
        },
      ),
  );
}

test("default tip 18% → a new bill gets an 18% tip", async ({ page }) => {
  await page.goto("/settings");
  const tip = page.getByLabel("Default tip (%)");
  await expect(tip).toHaveValue("20");
  await tip.fill("18");
  await page.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByText("Defaults saved")).toBeVisible();

  // "New bill" in the nav works from /settings (NewBillHost lives in the root layout).
  const nav = page.getByRole("navigation").filter({ has: page.getByRole("button", { name: "New bill" }) });
  await nav.getByRole("button", { name: "New bill" }).first().click();
  await expect(page).toHaveURL(/\/bills\/[^/]+\/receipt$/);
  const bills = await storedBills(page);
  expect(bills).toHaveLength(1);
  expect(bills[0].adjustments.find((a) => a.kind === "tip")?.value.bps).toBe(1800);
});

test("rejects an unknown currency and a bad tip", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Other currency code").fill("ZZZ");
  await expect(page.getByText("Not a recognised currency code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save defaults" })).toBeDisabled();
  await page.getByLabel("Other currency code").fill("SEK");
  await page.getByLabel("Default tip (%)").fill("abc");
  await expect(page.getByText("Enter a percentage from 0 to 100")).toBeVisible();
});

test("export → clear all → import restores the bills", async ({ page }) => {
  await page.goto("/");
  await seedBill(page, { title: "Tacos night" });
  await seedBill(page, { title: "Brunch" });
  await page.goto("/settings");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export backup" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^split-it-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();

  await page.getByRole("button", { name: "Clear all data" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear everything" }).click();
  await expect(page.getByText("All data cleared")).toBeVisible();
  expect((await storedBills(page)).length).toBe(0);
  await expect(page.getByLabel("Default tip (%)")).toHaveValue("20"); // re-seeded

  await page.getByLabel("Backup file").setInputFiles(file);
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Replace your 0 bills with 2 from this file?");
  await confirm.getByRole("button", { name: "Replace" }).click();
  await expect(page.getByText(/^Restored 2 bills/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Tacos night")).toBeVisible();
  await expect(page.getByText("Brunch")).toBeVisible();
});

test("importing a non-split-it file is rejected", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Backup file").setInputFiles({
    name: "x.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "savor" })),
  });
  await expect(page.getByText("This file isn't a split-it backup.")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
