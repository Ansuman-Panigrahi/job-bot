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

    logger.info(`Collection complete! Found ${jobs.length} jobs.`);

    console.log(`\nFound ${jobs.length} jobs\n`);
    console.log('---------------------------------');

    for (const job of jobs) {
      console.log(`\n${job.title}`);
      console.log(`${job.company}`);
      console.log(`${job.location}`);
      console.log(`${job.experience}`);
      if (job.salary) {
        console.log(`${job.salary}`);
      }
      if (job.postedDate) {
        console.log(`Posted: ${job.postedDate}`);
      }
      console.log(`${job.url}`);
      console.log('\n---------------------------------');
    }
  } catch (error) {
    logger.error('Job collection process failed:', error);
    process.exitCode = 1;
  } finally {
    await browserManager.close();
  }
}

main();
