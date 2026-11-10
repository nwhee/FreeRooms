import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for the critical flows. Browsers aren't installed by `npm ci`;
// run `npx playwright install chromium` once, start the app, then `npx playwright test`.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
