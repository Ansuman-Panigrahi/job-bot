import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserManagerOptions, NavigationResult } from './types';
import { BrowserError, NavigationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly options: BrowserManagerOptions;

  constructor(options: BrowserManagerOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      defaultTimeout: options.defaultTimeout ?? 30000,
    };
  }

  public async launch(): Promise<void> {
    try {
      logger.info(`Launching Chromium browser (headless: ${this.options.headless})...`);
      this.browser = await chromium.launch({
        headless: this.options.headless,
      });

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.options.defaultTimeout!);
      logger.info('Browser instance and page created successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BrowserError(`Failed to launch browser: ${message}`);
    }
  }

  public async navigateTo(url: string): Promise<NavigationResult> {
    if (!this.page) {
      throw new BrowserError('Browser page is not initialized. Call launch() first.');
    }

    try {
      logger.info(`Navigating to URL: ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });

      const title = await this.page.title();
      logger.info(`Successfully navigated to "${url}". Page title: "${title}"`);

      return {
        url: this.page.url(),
        title,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new NavigationError(`Failed navigating to "${url}": ${message}`);
    }
  }

  public async close(): Promise<void> {
    try {
      logger.info('Closing browser context and instance...');
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      logger.info('Browser closed successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BrowserError(`Failed to close browser cleanly: ${message}`);
    }
  }
}
