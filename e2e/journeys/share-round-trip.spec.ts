import { dinnerBill, EXPECTED, PEOPLE } from "../data/dinner";
import { seedBill } from "../helpers/seed";
import { expect, guardedPage, readTotals, test } from "../fixtures";

// Journey 3 (#27): the share round trip, through the real "Copy link" button. The link is
// opened in a FRESH browser context (empty IndexedDB, same network guard), shows the same
// totals read-only, and "Save a copy" turns it into a bill of the viewer's own.

test("Copy link → open in a new browser → same totals → Save a copy", async ({ page, browser }, testInfo) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (t: string) => void w.__copied.push(t) },
    });
  });
  const id = await seedBill(page, dinnerBill());
  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("reconcile-banner")).toContainText("adds up to $289.81");
  expect(await readTotals(page, PEOPLE)).toEqual(EXPECTED.totals);

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  const [link] = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(new URL(link).pathname).toBe("/s");

  const { page: viewer, blocked } = await guardedPage(browser, testInfo);
  await viewer.goto(link);
  await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("Dinner for four");
  await expect(viewer.getByTestId("reconcile-banner")).toContainText("adds up to $289.81");
  await expect(viewer.getByTestId("payer-line")).toContainText("Dee paid");
  expect(await readTotals(viewer, PEOPLE)).toEqual(EXPECTED.totals);
  await expect(viewer.getByRole("button", { name: "Mark paid" })).toHaveCount(0); // read-only

  await viewer.getByRole("button", { name: "Save a copy" }).click();
  await expect(viewer).toHaveURL(/\/bills\/[0-9a-f-]{36}\/summary$/);
  expect(new URL(viewer.url()).pathname).not.toContain(id);
  await expect(viewer.getByTestId("reconcile-banner")).toContainText("adds up to $289.81");
  expect(await readTotals(viewer, PEOPLE)).toEqual(EXPECTED.totals);
  // The copy is a real bill: it survives a reload and is editable (Mark paid is back).
  await viewer.reload();
  expect(await readTotals(viewer, PEOPLE)).toEqual(EXPECTED.totals);
  await expect(viewer.getByRole("button", { name: "Mark paid" }).first()).toBeVisible();

  await viewer.context().close();
  expect(blocked, "requests outside the app origin (viewer)").toEqual([]);
});
