import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { encodeShare } from "../lib/share";
import type { Bill } from "../lib/types";
import { buildBill, seedBill } from "./helpers/seed";

/*
 * The shared view (/s#<payload>, #25). The payload is minted in Node with the app's own
 * `encodeShare` (the same codec "Copy link" uses), then opened in a FRESH browser context, so
 * an empty IndexedDB proves the page renders from the fragment alone.
 *
 * Fixture (as e2e/summary.spec.ts): Ana, Ben, Cy, Sam; Sam paid; tax 888 bps, tip 20% pretax.
 *   Ana $12.89 · Ben $12.89 · Cy $25.78 · Sam $25.77 (payer absorbs rounding) = $77.33
 */
const NAMES = ["Ana", "Ben", "Cy", "Sam"];

function fixture(title = "Tacos"): Bill {
  return buildBill({
    title,
    date: "2026-11-25",
    people: [
      { id: "ana", name: "Ana", colorIndex: 0 },
      { id: "ben", name: "Ben", colorIndex: 1 },
      { id: "cy", name: "Cy", colorIndex: 2 },
      { id: "sam", name: "Sam", colorIndex: 3 },
    ],
    items: [
      { id: "n", name: "Nachos", quantity: 1, priceCents: 2000, claims: { ana: 1, ben: 1 } },
      { id: "p", name: "Pitcher", quantity: 1, priceCents: 3000, claims: { cy: 2, sam: 1 } },
      { id: "b", name: "Burger", quantity: 1, priceCents: 1000, claims: { sam: 1 } },
    ],
    adjustments: [
      { id: "tax", kind: "tax", label: "Tax", value: { type: "percent", bps: 888 }, split: "proportional" },
      { id: "tip", kind: "tip", label: "Tip", value: { type: "percent", bps: 2000 }, basis: "pretax", split: "proportional" },
    ],
    paidBy: "sam",
  });
}

/** Each person's big total, read off the PersonBreakdown row's disclosure button. */
async function totals(page: Page): Promise<string[]> {
  return Promise.all(
    NAMES.map(async (name) =>
      (await page.getByTestId(`person-${name}`).getByRole("button", { expanded: false }).first().innerText()).match(
        /\$[\d,]+\.\d{2}/,
      )![0],
    ),
  );
}

/** A new context with this project's device settings: its own, empty IndexedDB. */
async function freshPage(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext({ ...testInfo.project.use });
  return context.newPage();
}

/** Every bill row in this context's IndexedDB. */
function billRows(page: Page): Promise<{ id: string; title: string }[]> {
  return page.evaluate(
    () =>
      new Promise<{ id: string; title: string }[]>((resolve, reject) => {
        const req = indexedDB.open("split-it");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const idb = req.result;
          if (!idb.objectStoreNames.contains("bills")) return resolve([]);
          const all = idb.transaction("bills").objectStore("bills").getAll();
          all.onsuccess = () => {
            idb.close();
            resolve(all.result.map((b: { id: string; title: string }) => ({ id: b.id, title: b.title })));
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

test("a link opened in a fresh browser shows the source Summary's totals, and Save a copy stores it", async ({
  page,
  browser,
}, testInfo) => {
  const bill = fixture();
  await seedBill(page, bill);
  await page.goto(`/bills/${bill.id}/summary`);
  await expect(page.getByTestId("reconcile-banner")).toContainText("adds up to");
  const sourceTotals = await totals(page);
  expect(sourceTotals).toEqual(["$12.89", "$12.89", "$25.78", "$25.77"]);

  const payload = await encodeShare(bill);
  const shared = await freshPage(browser, testInfo);
  // The fragment is never sent: no request for the document (or anything else) carries it.
  const urls: string[] = [];
  shared.on("request", (r) => urls.push(r.url()));
  await shared.goto(`/s#${payload}`);

  await expect(shared.getByRole("heading", { level: 1 })).toHaveText("Tacos");
  await expect(shared.getByText("Nov 25, 2026", { exact: false })).toBeVisible();
  await expect(shared.getByTestId("reconcile-banner")).toContainText("adds up to $77.33");
  await expect(shared.getByTestId("payer-line")).toContainText("Sam paid");
  expect(await totals(shared)).toEqual(sourceTotals);
  // Read-only: no Mark paid, no payer picker, no link back into a Split step.
  await expect(shared.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
  await expect(shared.getByRole("button", { name: "Change" })).toHaveCount(0);
  expect(urls.some((u) => u.includes(payload.slice(2, 12)))).toBe(false);
  // Nothing was written by viewing.
  expect(await billRows(shared)).toEqual([]);

  // Which one are you? → highlight + scroll, still nothing written.
  await shared.getByRole("group", { name: "Which one are you?" }).getByRole("button", { name: "Cy" }).click();
  await expect(shared.getByTestId("person-Cy")).toHaveAttribute("data-highlighted", "true");
  await expect(shared.getByTestId("person-Ana")).not.toHaveAttribute("data-highlighted", "true");
  await expect(shared.getByTestId("person-Cy")).toBeInViewport();
  expect(await billRows(shared)).toEqual([]);

  // Save a copy → the bill's own Summary, with fresh ids and the same totals.
  await shared.getByRole("button", { name: "Save a copy" }).click();
  await expect(shared).toHaveURL(/\/bills\/[0-9a-f-]{36}\/summary$/);
  await expect(shared.getByText("Saved to your bills")).toBeVisible();
  await expect(shared.getByTestId("reconcile-banner")).toContainText("adds up to $77.33");
  expect(await totals(shared)).toEqual(sourceTotals);
  const newId = new URL(shared.url()).pathname.split("/")[2];
  expect(newId).not.toBe(bill.id);
  expect(await billRows(shared)).toEqual([{ id: newId, title: "Tacos" }]);

  await shared.context().close();
});

test("a truncated link shows the broken-link state", async ({ page }) => {
  const payload = await encodeShare(fixture());
  await page.goto(`/s#${payload.slice(0, Math.floor(payload.length / 2))}`);
  await expect(page.getByTestId("shared-error")).toContainText("This link looks broken or incomplete");
  await expect(page.getByRole("button", { name: "Save a copy" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open split-it" })).toHaveAttribute("href", "/");
});

test("a link with no payload shows the broken-link state", async ({ page }) => {
  await page.goto("/s");
  await expect(page.getByTestId("shared-error")).toContainText("This link looks broken or incomplete");
});

test("a link from a newer version asks for a refresh", async ({ page }) => {
  const payload = await encodeShare(fixture());
  await page.goto(`/s#9${payload.slice(1)}`);
  await expect(page.getByTestId("shared-error")).toContainText(
    "This link was made by a newer version of split-it — refresh to update",
  );
});

test("renders with no network once the shell is loaded", async ({ page, context }) => {
  await page.goto(`/s#${await encodeShare(fixture("Tacos"))}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tacos");

  await context.setOffline(true);
  const next = await encodeShare(fixture("Ramen"));
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, next);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ramen");
  expect(await totals(page)).toEqual(["$12.89", "$12.89", "$25.78", "$25.77"]);
  await context.setOffline(false);
});

test("the shared view is not indexed and has no BottomNav", async ({ page }) => {
  await page.goto(`/s#${await encodeShare(fixture())}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tacos");
  // BottomNav is the only "Primary" nav below md; NavRail (≥md) is hidden on mobile.
  await expect(page.getByRole("navigation", { name: "Primary" }).filter({ visible: true })).toHaveCount(
    page.viewportSize()!.width >= 768 ? 1 : 0,
  );
});
