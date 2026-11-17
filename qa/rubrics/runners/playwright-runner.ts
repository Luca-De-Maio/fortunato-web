import { chromium, type Browser, type Page } from "@playwright/test";

export class PlaywrightRunner {
  private browser: Browser | null = null;

  async launch(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
  }

  async newPage(): Promise<Page> {
    if (!this.browser) throw new Error("Call launch() first.");
    return this.browser.newPage();
  }

  async navigateTo(page: Page, url: string): Promise<number> {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    return res?.status() ?? 0;
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
