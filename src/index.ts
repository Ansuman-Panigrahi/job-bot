import { config } from './config/env';
import { logger } from './utils/logger';
import { BrowserManager } from './browser/browser-manager';

async function main(): Promise<void> {
  logger.setLevel(config.logLevel);
  logger.info('Starting Personal Job Helper Tool (Milestone 1)...');

  const browserManager = new BrowserManager({
    headless: config.headless,
    defaultTimeout: config.defaultTimeout,
  });

  try {
    await browserManager.launch();

    const targetUrl = 'https://example.com';
    const result = await browserManager.navigateTo(targetUrl);

    logger.info(`Navigated URL: ${result.url}`);
    logger.info(`Page Title: ${result.title}`);
  } catch (error) {
    logger.error('An error occurred during browser operations:', error);
    process.exitCode = 1;
  } finally {
    await browserManager.close();
  }
}

main();
