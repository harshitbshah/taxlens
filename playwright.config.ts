import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    // 127.0.0.1, not localhost: the server binds IPv4 loopback only (HM-9) and "localhost"
    // may resolve to ::1 first.
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // The dev server must already be running (`bun run dev`) before running tests.
  // We do not auto-start it here because it requires a live API key + tax data.
});
