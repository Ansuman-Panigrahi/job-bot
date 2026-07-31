import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface BrowserOptions {
  headless?: boolean;
  defaultTimeout?: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly headless: boolean;
  private readonly defaultTimeout: number;

  constructor(options: BrowserOptions = {}) {
    this.headless = options.headless ?? true;
    this.defaultTimeout = options.defaultTimeout ?? 30000;
  }

  public async launch(): Promise<Page> {
    try {
      logger.info(`Launching Chromium (headless: ${this.headless})...`);
      this.browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      });
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        (window as any).chrome = { runtime: {} };
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.defaultTimeout);
      logger.info('Browser ready.');
      return this.page;
    } catch (err) {
      throw new BrowserError(`Failed to launch browser: ${err instanceof Error ? err.message : err}`);
    }
  }

  public getPage(): Page {
    if (!this.page) {
      throw new BrowserError('Browser page is not initialized. Call launch() first.');
    }
    return this.page;
  }

  public async close(): Promise<void> {
    try {
      logger.info('Closing browser...');
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      this.page = null;
      this.context = null;
      this.browser = null;
      logger.info('Browser closed.');
    } catch (err) {
      throw new BrowserError(`Failed to close browser: ${err instanceof Error ? err.message : err}`);
    }
  }
}
