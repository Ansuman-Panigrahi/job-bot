import { config } from './config/env';
import { logger } from './utils/logger';
import { BrowserManager } from './browser/browser-manager';
import { NaukriProvider } from './providers/naukri-provider';
import { JobDatabase } from './db/database';
import { Job } from './models/job';
import { ReportGenerator } from './report/report-generator';
import { NotificationService } from './notification/notification-service';

async function main(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting Personal Job Discovery Tool (Naukri Search)...');

  const db = new JobDatabase();
  const browserManager = new BrowserManager({
    headless: config.headless,
    defaultTimeout: config.defaultTimeout,
  });
  const notificationService = new NotificationService();

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

    const newReport = ReportGenerator.generateAndSaveReport(allNewlyDiscovered, {
      reportType: 'new',
      keywords: config.searchKeywords,
    });

    let notificationSent = false;
    if (newReport) {
      notificationSent = await notificationService.notifyAll(newReport);
    }

    const isAllReportRequested = process.argv.includes('--all') || config.generateAllJobsReport;
    let allReportResult = null;
    if (isAllReportRequested) {
      const allHistoricalJobs = await db.getAllJobs();
      allReportResult = ReportGenerator.generateAndSaveReport(allHistoricalJobs, {
        reportType: 'all',
        title: 'All Stored Jobs',
      });
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

    console.log('\n------------------------------------');
    console.log(`Jobs Scraped   : ${totalScrapedCount}`);
    console.log(`New Jobs       : ${allNewlyDiscovered.length}`);
    console.log(`Duplicates     : ${duplicatesCount}`);
    console.log(`Database Total : ${totalDbJobs}`);
    console.log('');

    if (newReport) {
      console.log(`HTML Report`);
      console.log(`${newReport.filePath}`);
      console.log('');
      console.log(`Notification`);
      if (notificationSent) {
        console.log(`Email Sent ✓`);
      } else if (config.emailEnabled) {
        console.log(`Email Failed ✗`);
      } else {
        console.log(`Email Disabled (Config)`);
      }
    } else {
      console.log(`No new jobs found.`);
      console.log(`Report skipped.`);
      console.log(`Notification skipped.`);
    }

    if (allReportResult) {
      console.log('');
      console.log(`All Jobs Report`);
      console.log(`${allReportResult.filePath}`);
    }

    console.log('');
    console.log(`Execution Time`);
    console.log(`${durationSec}`);
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
