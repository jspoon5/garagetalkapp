import { defineConfig, devices } from "@playwright/test";

/**
 * Starts API (PGlite e2e server on :3000) and Vite web (:5173).
 * Chromium must be installed (`npx playwright install chromium`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @garagetalk/api exec tsx src/e2e-server.ts",
      url: "http://127.0.0.1:3000/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        PORT: "3000",
        SESSION_SECRET:
          "0123456789012345678901234567890123456789012345678901234567890123456",
        AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173",
        APP_BASE_URL: "http://127.0.0.1:5173",
      },
    },
    {
      command: "pnpm --filter @garagetalk/web exec vite --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
