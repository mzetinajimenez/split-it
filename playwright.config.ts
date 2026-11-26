import { defineConfig, devices } from "@playwright/test";

// Playwright drives a PRODUCTION build, not `next dev`. split-it's riskiest UI behaviour is
// bundler- and boundary-sensitive — the `?sheet=` history entries depend on Next's `__NA`
// marker — so a dev-server pass would exercise a different app than the one that ships.
//
// Port 3100 is dedicated to this suite: `next dev` runs on 3000 in this repo. A fixed port
// keeps `reuseExistingServer` usable locally without ever colliding with a dev server
// someone left running.
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Each test gets its own browser context, and therefore its own empty IndexedDB. That is
  // what makes first-run seeding testable at all: there is no `fake-indexeddb` here and no
  // reset hook to call — every test genuinely starts as a fresh install.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Opt-in: point at a preinstalled Chromium (e.g. a sandbox whose browser build differs
    // from this Playwright version). Unset everywhere else, including CI.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  // split-it is mobile-first, but ≥md gets its own navigation surface (#11): BottomNav is
  // `md:hidden` and NavRail is `hidden md:flex`. They are genuinely different controls, so a
  // single viewport would leave one of them entirely uncovered. Both projects run every spec.
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
