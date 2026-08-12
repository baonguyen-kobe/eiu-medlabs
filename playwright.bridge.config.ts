import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.BRIDGE_APP_PORT ?? "3200");
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("INVALID_BRIDGE_APP_PORT");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      CRON_SECRET: process.env.CRON_SECRET ?? "local-bridge-cron-secret",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
