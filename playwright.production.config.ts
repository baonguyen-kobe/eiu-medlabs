import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.PRODUCTION_SMOKE_PORT ?? "3100");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PRODUCTION_SMOKE_PORT must be an integer from 1 to 65535");
}

const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "production-bundle-smoke.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `npm run start -- --hostname ${host} --port ${port}`,
    env: {
      ...process.env,
      CRON_SECRET: process.env.CRON_SECRET ?? "local-e2e-cron-secret",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/login`,
  },
  projects: [
    {
      name: "production-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
