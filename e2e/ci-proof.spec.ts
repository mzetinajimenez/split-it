// TEMPORARY (#6 failure proof) — reverted in the next commit.
import { expect, test } from "@playwright/test";

const unusedProof = 1; // lint: no-unused-vars warning, fails under --max-warnings 0
const typeProof: number = "not a number"; // typecheck: TS2322

test("ci proof: deliberately broken e2e", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "this heading does not exist" })).toBeVisible({
    timeout: 2000,
  });
  void typeProof;
});
