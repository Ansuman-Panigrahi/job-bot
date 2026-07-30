import { Page } from 'playwright';
import { Job } from '../models/job';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { BrowserError } from '../utils/errors';

export class NaukriProvider {
  private readonly keywords: string;
  private readonly location: string;
  private readonly experience: string;
  private readonly maxResults: number;

  constructor(private page: Page) {
    this.keywords = config.searchKeywords;
    this.location = config.searchLocation;
    this.experience = config.searchExperience;
    this.maxResults = config.maxResults;
  }

  public async collectJobs(): Promise<Job[]> {
    try {
      logger.info(`Navigating to Naukri homepage...`);
      await this.page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded' });

      await this.dismissPopupsDefensively();
      await this.performSearch();

      const jobs: Job[] = [];

      while (jobs.length < this.maxResults) {
        logger.info(`Collecting jobs from page... (Currently collected: ${jobs.length}/${this.maxResults})`);
        
        const pageJobs = await this.extractJobsFromCurrentPage();
        logger.info(`Extracted ${pageJobs.length} valid jobs from current page.`);

        for (const job of pageJobs) {
          if (jobs.length < this.maxResults) {
            jobs.push(job);
          }
        }

        if (jobs.length >= this.maxResults) {
          logger.info(`Reached MAX_RESULTS target (${this.maxResults}). Stopping collection.`);
          break;
        }

        const hasNextPage = await this.navigateToNextPage();
        if (!hasNextPage) {
          logger.info('No more pages available. Stopping collection.');
          break;
        }
      }

      return jobs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Error during Naukri job collection: ${message}`);
      throw new BrowserError(`Naukri job collection failed: ${message}`);
    }
  }

  private async dismissPopupsDefensively(): Promise<void> {
    try {
      // Check for common overlay close buttons defensively without throwing timeout errors
      const closeButtons = this.page.locator('span.ni-gnb-icn-close, button:has-text("Got it"), .crossIcon, div.drawer-wrapper .close');
      const count = await closeButtons.count();
      for (let i = 0; i < count; i++) {
        const btn = closeButtons.nth(i);
        if (await btn.isVisible()) {
          logger.info('Dismissing overlay popup...');
          await btn.click({ force: true }).catch(() => {});
        }
      }
    } catch {
      // Ignore popup dismissal errors and proceed
    }
  }

  private async performSearch(): Promise<void> {
    logger.info(`Filling search form (Keywords: "${this.keywords}", Location: "${this.location}", Exp: "${this.experience} yrs")...`);

    // Resilient locator for Keyword search input
    const keywordInput = this.page.locator('input[placeholder*="skills" i], input[placeholder*="keyword" i], input[placeholder*="Search" i], input.sugInp').first();
    await keywordInput.waitFor({ state: 'visible', timeout: 10000 });
    await keywordInput.fill(this.keywords);

    // Resilient locator for Location search input
    if (this.location) {
      const locationInput = this.page.locator('input[placeholder*="location" i]').first();
      if (await locationInput.isVisible().catch(() => false)) {
        await locationInput.fill(this.location);
      }
    }

    // Resilient locator for Experience dropdown / input
    if (this.experience) {
      const expInput = this.page.locator('input[placeholder*="experience" i], #expInput, div.exp-wrap input').first();
      if (await expInput.isVisible().catch(() => false)) {
        await expInput.click().catch(() => {});
        // Try selecting experience option matching years
        const expOption = this.page.locator(`li:has-text("${this.experience} Yrs"), li:has-text("${this.experience} years"), span:has-text("${this.experience} Yrs")`).first();
        if (await expOption.isVisible().catch(() => false)) {
          await expOption.click().catch(() => {});
        }
      }
    }

    // Resilient locator for Search Button
    const searchBtn = this.page.locator('button:has-text("Search"), .qsbSubmit').first();
    await searchBtn.click();

    // Wait for search result cards container
    logger.info('Waiting for search results page...');
    await this.page.waitForSelector('div.srp-jobtuple-wrapper, article.jobTuple, div.cust-job-tuple, div.list', {
      timeout: 20000,
    });
  }

  private async extractJobsFromCurrentPage(): Promise<Job[]> {
    const cardLocators = this.page.locator('div.srp-jobtuple-wrapper, article.jobTuple, div.cust-job-tuple');
    const count = await cardLocators.count();
    const validJobs: Job[] = [];

    for (let i = 0; i < count; i++) {
      const card = cardLocators.nth(i);

      try {
        const titleEl = card.locator('a.title, a[class*="title"]').first();
        const companyEl = card.locator('a.comp-name, a.subTitle, [class*="comp-name"]').first();
        const locationEl = card.locator('span.locWrd, span.loc-wrap, span.location, [class*="location"]').first();
        const expEl = card.locator('span.expWrd, span.exp-wrap, span.experience, [class*="exp"]').first();
        const salaryEl = card.locator('span.salWrd, span.sal-wrap, span.salary, [class*="sal"]').first();
        const postedEl = card.locator('span.job-post-day, span.posted-date, [class*="posted"]').first();

        const title = (await titleEl.textContent().catch(() => ''))?.trim() || '';
        const rawUrl = (await titleEl.getAttribute('href').catch(() => ''))?.trim() || '';
        const company = (await companyEl.textContent().catch(() => ''))?.trim() || '';
        const location = (await locationEl.textContent().catch(() => ''))?.trim() || '';
        const experience = (await expEl.textContent().catch(() => ''))?.trim() || '';
        const salary = (await salaryEl.textContent().catch(() => ''))?.trim() || undefined;
        const postedDate = (await postedEl.textContent().catch(() => ''))?.trim() || undefined;

        // Ensure URL is absolute
        let url = rawUrl;
        if (url && !url.startsWith('http')) {
          url = `https://www.naukri.com${url.startsWith('/') ? '' : '/'}${url}`;
        }

        const candidateJob: Partial<Job> = {
          title,
          company,
          location,
          experience,
          salary: salary || undefined,
          postedDate: postedDate || undefined,
          url,
          source: 'naukri',
        };

        if (this.isValidJob(candidateJob)) {
          validJobs.push(candidateJob);
        } else {
          logger.warn(`Skipped invalid job tuple on page (Title: "${title}", Company: "${company}", URL: "${url}")`);
        }
      } catch (err) {
        logger.warn(`Failed extracting job card #${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return validJobs;
  }

  private isValidJob(job: Partial<Job>): job is Job {
    return Boolean(
      job.title &&
        job.title.trim().length > 0 &&
        job.company &&
        job.company.trim().length > 0 &&
        job.location &&
        job.location.trim().length > 0 &&
        job.url &&
        job.url.startsWith('http') &&
        job.source === 'naukri'
    );
  }

  private async navigateToNextPage(): Promise<boolean> {
    try {
      const nextBtn = this.page.locator('a.fwd, a[class*="styles_btn"]:has-text("Next"), a:has-text("Next")').first();
      
      if (await nextBtn.isVisible().catch(() => false)) {
        logger.info('Navigating to next results page...');
        await Promise.all([
          this.page.waitForResponse((resp) => resp.url().includes('naukri.com') && resp.status() === 200, { timeout: 15000 }).catch(() => {}),
          nextBtn.click(),
        ]);
        await this.page.waitForTimeout(2000); // Allow DOM rendering
        return true;
      }
    } catch (err) {
      logger.warn(`Failed navigating to next page: ${err instanceof Error ? err.message : String(err)}`);
    }

    return false;
  }
}
