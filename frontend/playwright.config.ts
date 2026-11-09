import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.APP_URL || "http://localhost:5173",
    trace: "retain-on-failure",
    ...(!process.env.CI ? { channel: "chrome" } : {}),
  },
  webServer: process.env.APP_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
      },
});
