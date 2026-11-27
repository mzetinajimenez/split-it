// e2e/fixtures.ts: the shared `test` for the #27 journeys, plus UI helpers that drive the
// real screens the way a table does (newBill, addItems, addPeople, claim, readTotals).
//
// `test` adds one auto fixture: every request from the test's browser context that isn't
// for the app's own origin is aborted and recorded, and the test fails if any were made.
// split-it v1 has no server surface, so the whole product must work with no network at all.
// Contexts a journey opens itself (the share round trip) go through `guardedPage`.

import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

/** Abort every request that isn't same-origin (or a local data:/blob: URL); return the list. */
export async function guardNetwork(context: BrowserContext, baseURL: string): Promise<string[]> {
  const origin = new URL(baseURL).origin;
  const blocked: string[] = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    blocked.push(url.href);
    return route.abort("blockedbyclient");
  });
  return blocked;
}

export const test = base.extend<{ offlineGuard: void }>({
  offlineGuard: [
    async ({ context, baseURL }, use) => {
      const blocked = await guardNetwork(context, baseURL!);
      await use();
      expect(blocked, "requests outside the app origin").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * A page in a brand-new browser context (its own, empty IndexedDB) with this project's device
 * settings and the same network guard. Close it with `page.context().close()`; the returned
 * `blocked` list must be empty by then.
 */
export async function guardedPage(browser: Browser, testInfo: TestInfo): Promise<{ page: Page; blocked: string[] }> {
  const context = await browser.newContext({ ...testInfo.project.use });
  const blocked = await guardNetwork(context, testInfo.project.use.baseURL!);
  return { page: await context.newPage(), blocked };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parse "$1,234.56" (the first money value in `text`) into cents. */
export function cents(text: string): number {
  const m = text.match(/-?\$[\d,]+\.\d{2}/);
  if (!m) throw new Error(`no money value in ${JSON.stringify(text)}`);
  const [whole, frac] = m[0].replace(/[$,]/g, "").split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(frac));
}

/** From `/`, tap New bill; returns the new bill's id (we land on its Receipt step). */
export async function newBill(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "New bill" }).click();
  await expect(page).toHaveURL(/\/bills\/[^/]+\/receipt$/);
  return new URL(page.url()).pathname.split("/")[2];
}

/** Jump to a workspace step with the StepNav (a push, like a real tap). */
export async function goToStep(page: Page, step: "Receipt" | "People" | "Split" | "Tip" | "Summary") {
  await page.getByRole("navigation", { name: "Bill steps" }).getByRole("link", { name: new RegExp(`^${step}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/${step.toLowerCase()}$`));
}

/** Type items into QuickAddRow on the Receipt step (Enter to commit, as by keyboard). */
export async function addItems(page: Page, items: readonly { name: string; price: string; qty?: number }[]) {
  const list = page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem");
  for (const item of items) {
    const before = await list.count();
    const form = page.getByRole("form", { name: "Add item" });
    await form.getByLabel("Item name").fill(item.name);
    if (item.qty) {
      const qtyButton = form.getByRole("button", { name: "Qty", exact: true });
      if (await qtyButton.isVisible()) await qtyButton.click();
      await form.getByLabel("Quantity").fill(String(item.qty));
    }
    await form.getByLabel("Price").fill(item.price);
    await form.getByLabel("Price").press("Enter");
    await expect(list).toHaveCount(before + 1);
  }
}

/** Add people on the People step, by typing each name and pressing Enter. */
export async function addPeople(page: Page, names: readonly string[]) {
  const field = page.getByLabel("Add a person");
  for (const name of names) {
    await field.fill(name);
    await field.press("Enter");
    await expect(page.getByTestId(`person-row-${name}`)).toBeVisible();
  }
}

/** A claim-board row, by item name (the button's accessible name starts "<name>, $…"). */
export const itemRow = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${escape(name)}, `) });

/** On the Split step: make `person` active and tap each item once (1 share each). */
export async function claim(page: Page, person: string, items: readonly string[]) {
  await page.getByRole("radiogroup", { name: "Who are you?" }).getByRole("radio", { name: person, exact: true }).click();
  for (const name of items) {
    const row = itemRow(page, name);
    await expect(row).not.toHaveAccessibleName(/you have claimed this$/);
    await row.click();
    await expect(row).toHaveAccessibleName(/you have claimed this$/);
  }
}

/** On a Summary (or the shared view): each person's big total, in cents. */
export async function readTotals(page: Page, names: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of names) {
    const text = await page.getByTestId(`person-${name}`).getByRole("button", { expanded: false }).first().innerText();
    out[name] = cents(text);
  }
  return out;
}
