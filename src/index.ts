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

    let newReportPath: string | null = null;
    if (allNewlyDiscovered.length > 0) {
      const html = ReportGenerator.generateReportHtml(allNewlyDiscovered, { reportType: 'new' });
      newReportPath = ReportGenerator.saveReportToFile(html, 'jobs-report');
    }

    const isAllReportRequested = process.argv.includes('--all') || config.generateAllJobsReport;
    let allReportPath: string | null = null;

    if (isAllReportRequested) {
      const allHistoricalJobs = await db.getAllJobs();
      if (allHistoricalJobs.length > 0) {
        const allHtml = ReportGenerator.generateReportHtml(allHistoricalJobs, {
          reportType: 'all',
          title: 'All Stored Jobs',
        });
        allReportPath = ReportGenerator.saveReportToFile(allHtml, 'all-jobs-report');
      }
    }

    console.log('\n------------------------------------');
    console.log(`Jobs Scraped   : ${totalScrapedCount}`);
    console.log(`New Jobs       : ${allNewlyDiscovered.length}`);
    console.log(`Duplicates     : ${duplicatesCount}`);
    console.log(`Database Total : ${totalDbJobs}`);
    console.log('');

    if (newReportPath) {
      console.log(`New Jobs Report : ${newReportPath}`);
    } else {
      console.log(`No new jobs found. New jobs report not generated.`);
    }

    if (allReportPath) {
      console.log(`All Jobs Report : ${allReportPath}`);
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
