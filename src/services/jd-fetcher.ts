import { Page } from 'playwright';
import { logger } from '../utils/logger';

export class JDFetcher {
  constructor(private page: Page) {}

  /**
   * Fetches the full job description from a given job URL.
   * Fallback to basic page body text if specific selectors are not found.
   */
  public async fetchDescription(url: string): Promise<string> {
    try {
      logger.info(`Fetching detailed Job Description from: ${url}`);
      
      // Navigate to the job listing page
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000, // 20s max for fetching description
      });

      // Simple wait to allow dynamic content (sometimes AJAX loads JD description)
      await this.page.waitForTimeout(1000);

      // Check if page title indicates restriction
      const title = await this.page.title().catch(() => '');
      if (title.toLowerCase().includes('access denied') || title.toLowerCase().includes('just a moment')) {
        logger.warn(`Access restriction encountered on ${url}. Relying on page snapshot...`);
      }

      // Try common job description selectors in Naukri
      const jdText = await this.page.evaluate(() => {
        const selectors = [
          '.job-desc',
          'section.job-desc',
          '.jd-desc',
          '.description',
          '.styles_job-desc__2G5c_',
          '#job-desc-content',
          '.styles_JdContainer__2p9S3',
          'section.styles_job-desc__2G5c_',
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector) as HTMLElement | null;
          if (element && element.innerText && element.innerText.trim().length > 100) {
            return element.innerText.trim();
          }
        }

        // Fallback to body text or main tag if selectors are not matched
        const main = (document.querySelector('main') || document.querySelector('article') || document.body) as HTMLElement | null;
        if (main) {
          return main.innerText || main.textContent || '';
        }

        return '';
      });

      if (!jdText || jdText.length < 50) {
        logger.warn(`Could not extract clean Job Description for: ${url}. (Extracted length: ${jdText ? jdText.length : 0})`);
        return '';
      }

      return this.cleanAndTruncateJd(jdText);
    } catch (err: any) {
      logger.error(`Error fetching job description from ${url}: ${err.message || err}`);
      return ''; // Graceful return
    }
  }

  private cleanAndTruncateJd(text: string): string {
    // Standardize line endings and collapse 3+ consecutive newlines to double newlines (keep paragraphs)
    let cleaned = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Strip out header metadata clutter by starting exactly at the "Job description" title
    const lower = cleaned.toLowerCase();
    const startWord = 'job description';
    const startIndex = lower.indexOf(startWord);
    if (startIndex !== -1) {
      cleaned = cleaned.substring(startIndex + startWord.length).trim();
    }

    const noiseKeywords = [
      'similar jobs',
      'similar-jobs',
      'jobs you might be interested in',
      'beware of imposters',
      'register to unlock',
      'about company',
      'company info',
      'company reviews',
      'employee reviews',
      'salary insights',
      'benefits & perks',
      'services you might be interested in'
    ];

    for (const keyword of noiseKeywords) {
      const index = cleaned.toLowerCase().indexOf(keyword);
      if (index !== -1) {
        cleaned = cleaned.substring(0, index).trim();
      }
    }

    // ==== Readability enhancements for skill lists and concatenated words ==== //
    // Insert a space before a capital letter that follows a lowercase letter (e.g., "cssjsp" -> "css jsp")
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Insert a space before a capitalized word following a lowercase word (handles "Vue" etc.)
    cleaned = cleaned.replace(/([a-z])([A-Z][a-z])/g, '$1 $2');
    // Ensure a space after periods when not already present
    cleaned = cleaned.replace(/\.(?=\S)/g, '. ');
    // Replace stray periods that separate skills with a comma and space
    cleaned = cleaned.replace(/\.([A-Za-z])/g, ', $1');
    // Ensure commas are followed by a space
    cleaned = cleaned.replace(/,([A-Za-z])/g, ', $1');
    // Collapse multiple spaces into a single space (but keep newlines)
    cleaned = cleaned.replace(/ +/g, ' ');

    return cleaned.substring(0, 4000);
  }
}
