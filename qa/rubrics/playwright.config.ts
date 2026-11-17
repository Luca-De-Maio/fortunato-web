import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./rubrics",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  use: {
    baseURL: process.env.TARGET_URL ?? "http://localhost:4321",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["json", { outputFile: "reports/playwright-results.json" }]],
});
