import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir:
    process.env.NOVA_BROWSER_RESULTS ?? "/tmp/nova-ember-browser-results",
  use: {
    baseURL: process.env.NOVA_BASE_URL ?? "http://127.0.0.1:3100",
    channel: process.env.NOVA_BROWSER_CHANNEL || undefined,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
