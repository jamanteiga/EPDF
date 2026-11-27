// Pruebas automáticas de ePDF (Playwright) — se ejecutan en GitHub Actions en cada cambio
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4173", ...devices["iPad Pro 11 landscape"], browserName: "chromium", acceptDownloads: true },
  webServer: { command: "python3 -m http.server 4173 --bind 127.0.0.1", url: "http://127.0.0.1:4173/index.html", reuseExistingServer: !process.env.CI },
});
