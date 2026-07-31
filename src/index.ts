import { config } from './config/env';
import { logger } from './utils/logger';
import { BrowserManager } from './browser/browser-manager';
import { NaukriProvider } from './providers/naukri-provider';
import { JobDatabase } from './db/database';
import { Job } from './models/job';
import { ReportGenerator } from './report/report-generator';

async function main(): Promise<void> {
  logger.info('Starting Personal Job Discovery Tool (Naukri Search)...');

  const db = new JobDatabase();
  const browserManager = new BrowserManager({
    headless: config.headless,
    defaultTimeout: config.defaultTimeout,
  });

  try {
    await db.init();
    await db.purgeOldJobs(60);

    const page = await browserManager.launch();

    let totalScrapedCount = 0;
    const allNewlyDiscovered: Job[] = [];

    for (const keyword of config.searchKeywords) {
      logger.info(`\n>>> Executing search for keyword: "${keyword}" <<<`);
      const provider = new NaukriProvider(page, keyword);
      const scrapedJobs = await provider.collectJobs();
      totalScrapedCount += scrapedJobs.length;

      const newlyDiscovered = await db.saveJobs(scrapedJobs);
      allNewlyDiscovered.push(...newlyDiscovered);
    }

    const totalDbJobs = await db.getTotalJobsCount();
    const duplicatesCount = totalScrapedCount - allNewlyDiscovered.length;

    let reportPath: string | null = null;
    if (allNewlyDiscovered.length > 0) {
      const html = ReportGenerator.generateReportHtml(allNewlyDiscovered);
      reportPath = ReportGenerator.saveReportToFile(html);
    }

    console.log('\n------------------------------------');
    console.log(`Jobs Scraped   : ${totalScrapedCount}`);
    console.log(`New Jobs       : ${allNewlyDiscovered.length}`);
    console.log(`Duplicates     : ${duplicatesCount}`);
    console.log(`Database Total : ${totalDbJobs}`);
    console.log('');
    if (reportPath) {
      console.log(`HTML Report`);
      console.log(`${reportPath}`);
    } else {
      console.log(`No new jobs found.`);
      console.log(`Report not generated.`);
    }
    console.log('------------------------------------\n');
  } catch (error) {
    logger.error('Job collection process failed:', error);
    process.exitCode = 1;
  } finally {
    await browserManager.close();
    await db.close();
  }
}

main();
