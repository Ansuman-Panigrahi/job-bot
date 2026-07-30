import fs from 'fs';
import path from 'path';
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
      logger.info('Navigating to Naukri homepage...');
      await this.page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded' });

      // Dismiss popups on homepage
      await this.dismissPopups(this.page);

      // Perform search via UI
      await this.performSearch();

      // Dedicated popup handling after search results page loads
      logger.info('Search results loaded. Running dedicated popup dismissal...');
      await this.dismissPopups(this.page);

      // Determine top-level card selector dynamically
      const cardSelector = await this.determineJobCardSelector();
      logger.info(`Waiting for job cards matching selector ("${cardSelector}")...`);

      try {
        await this.page.waitForSelector(cardSelector, { state: 'visible', timeout: 10000 });
      } catch {
        await this.handleNoJobCardsFound(cardSelector);
      }

      const jobs: Job[] = [];
      let pageNumber = 1;

      while (jobs.length < this.maxResults) {
        const currentSelector = await this.determineJobCardSelector();
        logger.info(`--- Processing Page ${pageNumber} (Collected: ${jobs.length}/${this.maxResults}) ---`);
        await this.dismissPopups(this.page);

        const pageResult = await this.extractJobsFromCurrentPage(pageNumber, jobs, currentSelector);

        for (const job of pageResult.extractedJobs) {
          if (jobs.length < this.maxResults) {
            jobs.push(job);
          }
        }

        if (jobs.length >= this.maxResults) {
          logger.info(`Reached MAX_RESULTS limit (${this.maxResults}). Stopping collection.`);
          break;
        }

        const hasNextPage = await this.navigateToNextPage(currentSelector);
        if (!hasNextPage) {
          logger.info('No further pagination pages found. Stopping collection.');
          break;
        }

        pageNumber++;
      }

      logger.info(`Collection complete. Total valid jobs collected: ${jobs.length}`);
      return jobs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Naukri job collection failed: ${message}`);
      throw err instanceof BrowserError ? err : new BrowserError(`Naukri job collection failed: ${message}`);
    }
  }

  private async determineJobCardSelector(): Promise<string> {
    const candidates = [
      'div.srp-jobtuple-wrapper',
      'div.cust-job-tuple',
      'article.jobTuple',
      'div[data-job-id]',
    ];

    for (const selector of candidates) {
      const count = await this.page.locator(selector).count().catch(() => 0);
      if (count > 0) {
        return selector;
      }
    }

    return 'div.srp-jobtuple-wrapper';
  }

  private async dismissPopups(page: Page): Promise<void> {
    const popupHandlers = [
      {
        name: 'Cookie Consent Banner',
        locator: page.getByRole('button', { name: /accept|got it|agree/i }).or(page.getByText(/accept|got it/i)).first(),
      },
      {
        name: 'Login / Sign In Modal',
        locator: page
          .getByRole('button', { name: /close|dismiss/i })
          .or(page.getByLabel(/close|dismiss/i))
          .or(page.locator('.crossIcon, span.ni-gnb-icn-close, div.drawer-wrapper .close, #register_Layer .crossIcon'))
          .first(),
      },
      {
        name: 'Notification / Promo Dialog',
        locator: page.getByRole('button', { name: /later|no thanks|not now|dismiss/i }).or(page.getByText(/later|no thanks|not now/i)).first(),
      },
    ];

    for (const popup of popupHandlers) {
      try {
        if (await popup.locator.isVisible({ timeout: 1000 }).catch(() => false)) {
          await popup.locator.click({ force: true, timeout: 2000 }).catch(() => {});
          logger.info(`Dismissed overlay: ${popup.name}`);
        }
      } catch {
        // Continue silently
      }
    }

    try {
      const googleIframe = page.locator('#credential_picker_container, iframe[title*="Sign in with Google"]').first();
      if (await googleIframe.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape').catch(() => {});
        logger.info('Dismissed overlay: Google Sign-In Dialog');
      }
    } catch {
      // Continue silently
    }
  }

  private async performSearch(): Promise<void> {
    logger.info(`Filling search form (Keywords: "${this.keywords}", Location: "${this.location}", Exp: "${this.experience} yrs")...`);

    const keywordInput = this.page
      .getByPlaceholder(/search keyword|skills|designations|companies/i)
      .or(this.page.locator('input.sugInp'))
      .first();

    await keywordInput.waitFor({ state: 'visible', timeout: 10000 });
    await keywordInput.fill(this.keywords);

    if (this.location) {
      const locationInput = this.page
        .getByPlaceholder(/enter location|location/i)
        .or(this.page.locator('input[placeholder*="location" i]'))
        .first();

      if (await locationInput.isVisible().catch(() => false)) {
        await locationInput.fill(this.location);
      }
    }

    if (this.experience) {
      const expInput = this.page
        .getByPlaceholder(/select experience|experience/i)
        .or(this.page.locator('#expInput'))
        .first();

      if (await expInput.isVisible().catch(() => false)) {
        await expInput.click().catch(() => {});
        const expOption = this.page.getByText(new RegExp(`${this.experience} Yrs|${this.experience} years`, 'i')).first();
        if (await expOption.isVisible().catch(() => false)) {
          await expOption.click().catch(() => {});
        }
      }
    }

    const searchBtn = this.page
      .getByRole('button', { name: /search/i })
      .or(this.page.locator('.qsbSubmit'))
      .first();

    await searchBtn.click();
  }

  private async extractJobsFromCurrentPage(
    pageNumber: number,
    existingJobs: Job[],
    cardSelector: string
  ): Promise<{ extractedJobs: Job[]; cardsDetected: number; skippedCount: number }> {
    const rawCards = await this.page.evaluate((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.map((card) => {
        const titleEl = card.querySelector('a.title, a[href*="/job-listings"], a[class*="title"]') as HTMLAnchorElement | null;
        const companyEl = card.querySelector('a.comp-name, [class*="comp-name"], a.subTitle, span.comp-name') as HTMLElement | null;
        const locationEl = card.querySelector('span.locWrd, span.location, [class*="location"], span[class*="loc"]') as HTMLElement | null;
        const expEl = card.querySelector('span.expWrd, span.experience, [class*="exp"]') as HTMLElement | null;
        const salaryEl = card.querySelector('span.salWrd, span.salary, [class*="sal"]') as HTMLElement | null;
        const postedEl = card.querySelector('span.job-post-day, span.posted-date, [class*="posted"]') as HTMLElement | null;

        const title = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
        const rawUrl = (titleEl?.getAttribute('href') || '').trim();
        const company = (companyEl?.getAttribute('title') || companyEl?.textContent || '').trim();
        const location = (locationEl?.textContent || '').trim();
        const experience = (expEl?.textContent || '').trim();
        const salary = (salaryEl?.textContent || '').trim();
        const postedDate = (postedEl?.textContent || '').trim();

        return {
          title,
          company,
          location,
          experience: experience || 'Not specified',
          salary: salary || undefined,
          postedDate: postedDate || undefined,
          url: rawUrl,
        };
      });
    }, cardSelector);

    const count = rawCards.length;
    logger.info(`Job card locator ("${cardSelector}") matched ${count} elements on page ${pageNumber}.`);

    const extractedJobs: Job[] = [];
    let skippedCount = 0;
    const existingUrls = new Set(existingJobs.map((j) => j.url));

    for (let i = 0; i < rawCards.length; i++) {
      const raw = rawCards[i]!;
      const index = i + 1;

      let url = raw.url;
      if (url && !url.startsWith('http')) {
        url = `https://www.naukri.com${url.startsWith('/') ? '' : '/'}${url}`;
      }

      if (!raw.title) {
        logger.warn(`Skipped card #${index}: Missing job title.`);
        skippedCount++;
        continue;
      }

      if (!raw.company) {
        logger.warn(`Skipped card #${index} ("${raw.title}"): Missing company name.`);
        skippedCount++;
        continue;
      }

      if (!raw.location) {
        logger.warn(`Skipped card #${index} ("${raw.title}"): Missing location.`);
        skippedCount++;
        continue;
      }

      if (!url || !url.startsWith('http')) {
        logger.warn(`Skipped card #${index} ("${raw.title}"): Missing or invalid URL.`);
        skippedCount++;
        continue;
      }

      if (existingUrls.has(url)) {
        logger.warn(`Skipped card #${index} ("${raw.title}"): Duplicate job URL already collected.`);
        skippedCount++;
        continue;
      }

      const validJob: Job = {
        title: raw.title,
        company: raw.company,
        location: raw.location,
        experience: raw.experience,
        salary: raw.salary,
        postedDate: raw.postedDate,
        url,
        source: 'naukri',
      };

      existingUrls.add(url);
      extractedJobs.push(validJob);

      const globalIndex = existingJobs.length + extractedJobs.length;
      console.log('------------------------------------------------');
      console.log(`Job #${globalIndex} (Page ${pageNumber})`);
      console.log(`Title:      ${validJob.title}`);
      console.log(`Company:    ${validJob.company}`);
      console.log(`Location:   ${validJob.location}`);
      console.log(`Experience: ${validJob.experience}`);
      if (validJob.salary) console.log(`Salary:     ${validJob.salary}`);
      if (validJob.postedDate) console.log(`Posted:     ${validJob.postedDate}`);
      console.log(`URL:        ${validJob.url}`);
      console.log('------------------------------------------------');
    }

    logger.info(`Page ${pageNumber} Summary: Cards detected: ${count} | Successfully extracted: ${extractedJobs.length} | Skipped: ${skippedCount}`);

    return {
      extractedJobs,
      cardsDetected: count,
      skippedCount,
    };
  }

  private async navigateToNextPage(cardSelector: string): Promise<boolean> {
    try {
      const nextBtn = this.page.locator('a.fwd, a[class*="styles_btn"]:has-text("Next"), a:has-text("Next")').first();

      if (await nextBtn.isVisible().catch(() => false)) {
        logger.info('Clicking Next page button...');
        await nextBtn.click();
        
        // Wait for page rendering and DOM update after clicking Next
        await this.page.waitForTimeout(1500);
        await this.page.waitForSelector(cardSelector, { state: 'visible', timeout: 10000 }).catch(() => {});
        return true;
      }
    } catch (err) {
      logger.warn(`Pagination navigation failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return false;
  }

  private async handleNoJobCardsFound(cardSelector: string): Promise<never> {
    const currentUrl = this.page.url();
    const pageTitle = await this.page.title().catch(() => 'Unknown Title');
    const cardCount = await this.page.locator(cardSelector).count().catch(() => 0);

    logger.error(`No job cards found after popup dismissal.`);
    logger.error(`Current URL: ${currentUrl}`);
    logger.error(`Page Title: ${pageTitle}`);
    logger.error(`Matching job card elements found: ${cardCount}`);

    const debugDir = path.resolve(process.cwd(), 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const screenshotPath = path.join(debugDir, 'no-job-cards.png');
    await this.page.screenshot({ path: screenshotPath, fullPage: true }).catch((err) => {
      logger.error(`Failed saving debug screenshot: ${err instanceof Error ? err.message : String(err)}`);
    });

    logger.info(`Saved debug screenshot to ${screenshotPath}`);

    throw new BrowserError('No job cards found after dismissing popups.');
  }
}
