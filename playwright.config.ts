import { defineConfig, devices } from "@playwright/test";

// e2e runs against a production build (`next build && next start`), not the dev
// server: it's what ships, and it avoids dev-only overlays and on-demand compile
// flakiness. Port 3100 keeps it clear of a `npm run dev` on :3000.
// 127.0.0.1 rather than localhost: localhost can resolve to ::1 first, which
// the server may not be listening on.
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Opt-in: point at a preinstalled Chromium (e.g. a sandbox whose browser build
    // differs from this Playwright version). Unset everywhere else.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
