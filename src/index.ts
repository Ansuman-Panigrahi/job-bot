import { config } from './config/env';
import { logger } from './utils/logger';
import { BrowserManager } from './browser/browser-manager';
import { NaukriProvider } from './providers/naukri-provider';

async function main(): Promise<void> {
  logger.info('Starting Personal Job Helper Tool (Naukri Search)...');

  const browserManager = new BrowserManager({
    headless: config.headless,
    defaultTimeout: config.defaultTimeout,
  });

  try {
    const page = await browserManager.launch();

    const provider = new NaukriProvider(page);
    const jobs = await provider.collectJobs();

    console.log('\n================================================');
    console.log(`FINAL COLLECTION SUMMARY: Found ${jobs.length} valid jobs`);
    console.log('================================================\n');
  } catch (error) {
    logger.error('Job collection process failed:', error);
    process.exitCode = 1;
  } finally {
    await browserManager.close();
  }
}

main();
