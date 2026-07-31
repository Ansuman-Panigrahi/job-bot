import { config } from './config/env';
import { logger } from './utils/logger';
import { BrowserManager } from './browser/browser-manager';
import { NaukriProvider } from './providers/naukri-provider';
import { JobDatabase } from './db/database';
import { Job } from './models/job';
import { AnalyzedJob } from './models/analysis';
import { JDFetcher } from './services/jd-fetcher';
import { AIScorer } from './services/ai-scorer';
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
  const aiScorer = new AIScorer();

  try {
    await db.init();
    await db.purgeOldJobs(60);

    const page = await browserManager.launch();

    let totalScrapedCount = 0;
    const allNewlyDiscovered: Job[] = [];

    // 1. Scraping Layer: Collect lightweight jobs
    for (const keyword of config.searchKeywords) {
      logger.info(`\n>>> Executing search for keyword: "${keyword}" <<<`);
      const provider = new NaukriProvider(page, keyword);
      const scrapedJobs = await provider.collectJobs();
      totalScrapedCount += scrapedJobs.length;

      const newlyDiscovered = await db.saveJobs(scrapedJobs);
      allNewlyDiscovered.push(...newlyDiscovered);
    }

    const duplicatesCount = totalScrapedCount - allNewlyDiscovered.length;

    // 2. Fetch Detailed Job Descriptions for newly discovered jobs
    if (allNewlyDiscovered.length > 0) {
      logger.info(`\n>>> Fetching detailed Job Descriptions for ${allNewlyDiscovered.length} new jobs <<<`);
      const jdFetcher = new JDFetcher(page);
      const jdMap = new Map<string, string>();

      for (const job of allNewlyDiscovered) {
        const jd = await jdFetcher.fetchDescription(job.url);
        job.description = jd;
        await db.updateJobDescription(job.id!, jd);
        jdMap.set(job.url, jd);
      }

      // Run AI Scoring if enabled
      if (aiScorer.isEnabled()) {
        const analyses = await aiScorer.scoreJobsConcurrently(allNewlyDiscovered, jdMap);
        for (const analysis of analyses) {
          await db.saveAnalysis(analysis);
        }
      } else {
        if (!config.aiEnabled) {
          logger.info('\nAI Scoring skipped: Disabled via AI_ENABLED config setting.');
        } else {
          logger.info('\nAI Scoring skipped: GEMINI_API_KEY is not configured.');
        }
      }
    } else {
      logger.info('\nNo new jobs discovered. Skipping Job Description fetching and AI Analysis.');
    }

    // 3. Retrieve AnalyzedJobs for New Report
    const newAnalyzedJobs: AnalyzedJob[] = [];
    for (const job of allNewlyDiscovered) {
      const analysis = await db.getAnalysisForJob(job.id!);
      newAnalyzedJobs.push({
        job,
        analysis: analysis || undefined,
      });
    }

    // Generate New Report
    const newReport = ReportGenerator.generateAndSaveReport(newAnalyzedJobs, {
      reportType: 'new',
      keywords: config.searchKeywords,
    });

    // Send Notification
    let notificationSent = false;
    if (newReport) {
      notificationSent = await notificationService.notifyAll(newReport);
    }

    // Generate All Jobs Report if requested
    const isAllReportRequested = process.argv.includes('--all') || config.generateAllJobsReport;
    let allReportResult = null;
    if (isAllReportRequested) {
      const allHistoricalAnalyzedJobs = await db.getAllAnalyzedJobs();
      allReportResult = ReportGenerator.generateAndSaveReport(allHistoricalAnalyzedJobs, {
        reportType: 'all',
        title: 'All Stored Jobs',
      });
    }

    const totalDbJobs = await db.getTotalJobsCount();
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
