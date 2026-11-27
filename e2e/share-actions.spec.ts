import { expect, test, type Page } from "@playwright/test";
import { decodeShare } from "../lib/share";
import { seedBill } from "./helpers/seed";

const people = [
  { id: "ana", name: "Ana", colorIndex: 0 },
  { id: "sam", name: "Sam", colorIndex: 1 },
];

async function open(page: Page, claimAll = true) {
  const id = await seedBill(page, {
    title: "Tacos",
    date: "2026-11-25",
    people,
    items: [
      { id: "n", name: "Nachos", quantity: 1, priceCents: 2000, claims: { ana: 1, sam: 1 } },
      { id: "u", name: "Soda", quantity: 1, priceCents: 500, claims: claimAll ? { ana: 1 } : {} },
    ],
    paidBy: "sam",
  });
  await page.goto(`/bills/${id}/summary`);
}

/** Remove the share/clipboard APIs (or install fakes) before the app runs. */
const stub = (page: Page, share: boolean, clipboard: boolean) =>
  page.addInitScript(
    ([s, c]) => {
      const w = window as unknown as { __copied: string[]; __shared: unknown[] };
      w.__copied = [];
      w.__shared = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: s ? async (d: unknown) => void w.__shared.push(d) : undefined,
      });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: c ? { writeText: async (t: string) => void w.__copied.push(t) } : undefined,
      });
    },
    [share, clipboard],
  );

const copied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shared: { text?: string; url?: string }[] }).__shared);

test("share summary falls back to the clipboard with a toast", async ({ page }) => {
  await stub(page, false, true);
  await open(page);
  await page.getByRole("button", { name: "Share summary" }).click();
  await expect(page.getByText("Copied summary")).toBeVisible();
  expect((await copied(page))[0]).toContain("Tacos");
});

test("share summary uses navigator.share when available", async ({ page }) => {
  await stub(page, true, true);
  await open(page);
  await page.getByRole("button", { name: "Share summary" }).click();
  await expect.poll(async () => (await shared(page)).length).toBe(1);
  expect((await shared(page))[0].text).toContain("Ana owes Sam");
});

test("copy link puts a decodable /s# link on the clipboard, with no query string or network request", async ({ page }) => {
  await stub(page, false, true);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await open(page);
  requests.length = 0;
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied — anyone with it can view this bill")).toBeVisible();
  const url = new URL((await copied(page))[0]);
  expect(url.pathname).toBe("/s");
  expect(url.search).toBe("");
  expect((await decodeShare(url.hash)).title).toBe("Tacos");
  expect(requests.filter((u) => u.includes("#") || u.includes("1."))).toEqual([]);
});

test("copy link falls back to navigator.share when there is no clipboard", async ({ page }) => {
  await stub(page, true, false);
  await open(page);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect.poll(async () => (await shared(page)).length).toBe(1);
  expect((await shared(page))[0].url).toContain("/s#1.");
});

test("share both sends link and text in one share call", async ({ page }) => {
  await stub(page, true, true);
  await open(page);
  await page.getByRole("button", { name: "Share both" }).click();
  await expect.poll(async () => (await shared(page)).length).toBe(1);
  const [d] = await shared(page);
  expect(d.url).toContain("/s#");
  expect(d.text).toContain("Tacos");
});

test("with no share or clipboard API nothing crashes; an error toast shows", async ({ page }) => {
  await stub(page, false, false);
  await open(page);
  await page.getByRole("button", { name: "Share summary" }).click();
  await expect(page.getByText("Couldn’t copy the summary")).toBeVisible();
});

test("a cancelled share sheet is silent; another failure toasts", async ({ page }) => {
  await page.addInitScript(() => {
    let n = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("x", n++ === 0 ? "AbortError" : "NotAllowedError");
      },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Share summary" }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText("Couldn’t share")).toHaveCount(0);
  await page.getByRole("button", { name: "Share summary" }).click();
  await expect(page.getByText("Couldn’t share. Try again")).toBeVisible();
});

test("unclaimed items ask for confirmation before sharing", async ({ page }) => {
  await stub(page, false, true);
  await open(page, false);
  await page.getByRole("button", { name: "Share summary" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("1 item is still unclaimed — share anyway?");
  expect(await copied(page)).toEqual([]);
  await page.getByRole("button", { name: "Share anyway" }).click();
  await expect(page.getByText("Copied summary")).toBeVisible();
});
