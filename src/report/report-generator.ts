import fs from 'fs';
import path from 'path';
import { Job } from '../models/job';
import { logger } from '../utils/logger';

export interface ReportOptions {
  generatedAt?: Date;
  title?: string;
  reportType?: 'new' | 'all';
}

export class ReportGenerator {
  /**
   * Generates a complete standalone HTML document string from an array of jobs.
   * Provider-agnostic: relies ONLY on Job[].
   */
  public static generateReportHtml(jobs: Job[], options: ReportOptions = {}): string {
    const generatedAt = options.generatedAt || new Date();
    const reportTitle = options.title || (options.reportType === 'all' ? 'All Stored Jobs' : 'New Jobs Found');
    const badgeText = options.reportType === 'all' ? `${jobs.length} Total` : `${jobs.length} New`;
    const statusText = options.reportType === 'all' ? 'stored' : 'newly discovered';

    const formattedDate = generatedAt.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const sources = Array.from(new Set(jobs.map((j) => j.source || 'Naukri'))).join(', ');
    const safeJobsJson = JSON.stringify(jobs).replace(/</g, '\\u003c');

    const jobCardsHtml = jobs
      .map((job, index) => {
        const title = this.escapeHtml(job.title);
        const company = this.escapeHtml(job.company);
        const location = this.escapeHtml(job.location);
        const experience = this.escapeHtml(job.experience);
        const salary = job.salary ? this.escapeHtml(job.salary) : null;
        const source = this.escapeHtml(job.source || 'Naukri');
        const url = this.escapeHtml(job.url);

        return `
        <div class="job-card" data-index="${index}" data-title="${title.toLowerCase()}" data-company="${company.toLowerCase()}" data-location="${location.toLowerCase()}">
          <h2 class="job-title">
            <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
          </h2>
          <div class="job-company">${company}</div>
          
          <div class="job-details">
            <div class="detail-item">📍 <span>${location}</span></div>
            <div class="detail-item">💼 <span>${experience}</span></div>
            ${salary ? `<div class="detail-item">💰 <span>${salary}</span></div>` : ''}
            <div class="detail-item"><span class="source-badge">${source}</span></div>
          </div>

          <div class="ai-score-slot">
            <span class="ai-icon">🤖</span> Match Score: <span class="score-badge-placeholder">Coming Soon</span>
          </div>

          <div class="card-action">
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn-open-job">Open Job ↗</a>
          </div>
        </div>`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Jobs Found - ${formattedDate}</title>
  <style>
    :root {
      --bg-color: #0d1117;
      --card-bg: #161b22;
      --border-color: #30363d;
      --text-main: #c9d1d9;
      --text-muted: #8b949e;
      --text-heading: #f0f6fc;
      --accent-color: #2f81f7;
      --accent-hover: #58a6ff;
      --badge-bg: #21262d;
      --badge-text: #79c0ff;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      line-height: 1.5;
      padding: 20px 16px 40px 16px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    header {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .header-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }

    h1 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-heading);
    }

    .job-count-pill {
      background-color: var(--accent-color);
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 12px;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      font-size: 13px;
      color: var(--text-muted);
      border-top: 1px solid var(--border-color);
      padding-top: 12px;
    }

    .meta-label {
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .meta-value {
      color: var(--text-heading);
      font-weight: 500;
      margin-top: 2px;
    }

    .controls-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .search-input {
      flex: 1;
      min-width: 220px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 14px;
      color: var(--text-main);
      font-size: 14px;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--accent-color);
    }

    .sort-select {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px 14px;
      color: var(--text-main);
      font-size: 14px;
      outline: none;
      cursor: pointer;
    }

    .status-summary {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }

    .jobs-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .job-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 18px;
      transition: border-color 0.2s ease;
    }

    .job-card:hover {
      border-color: var(--text-muted);
    }

    .job-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .job-title a {
      color: var(--accent-hover);
      text-decoration: none;
    }

    .job-title a:hover {
      text-decoration: underline;
    }

    .job-company {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-heading);
      margin-bottom: 12px;
    }

    .job-details {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .detail-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .source-badge {
      background: var(--badge-bg);
      color: var(--badge-text);
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .ai-score-slot {
      background: #1c2128;
      border: 1px dashed var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .score-badge-placeholder {
      background: #2d333b;
      color: #adbac7;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }

    .card-action {
      display: flex;
      justify-content: flex-end;
    }

    .btn-open-job {
      background-color: var(--accent-color);
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 6px;
      display: inline-block;
      transition: background-color 0.2s ease;
    }

    .btn-open-job:hover {
      background-color: var(--accent-hover);
    }

    .no-results {
      text-align: center;
      padding: 40px 20px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-muted);
      display: none;
    }

    @media (max-width: 600px) {
      body {
        padding: 12px 10px 30px 10px;
      }
      header, .job-card {
        padding: 14px;
      }
      h1 {
        font-size: 18px;
      }
      .job-title {
        font-size: 16px;
      }
      .controls-bar {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title-row">
        <h1>${this.escapeHtml(reportTitle)}</h1>
        <span class="job-count-pill" id="totalBadge">${this.escapeHtml(badgeText)}</span>
      </div>

      <div class="metadata-grid">
        <div>
          <div class="meta-label">Generated At</div>
          <div class="meta-value">${formattedDate}</div>
        </div>
        <div>
          <div class="meta-label">Search Sources</div>
          <div class="meta-value">${this.escapeHtml(sources)}</div>
        </div>
        <div>
          <div class="meta-label">Total Jobs</div>
          <div class="meta-value">${jobs.length} Jobs</div>
        </div>
      </div>
    </header>

    <div class="controls-bar">
      <input type="text" id="searchInput" class="search-input" placeholder="Search by title, company, or location..." />
      <select id="sortSelect" class="sort-select">
        <option value="default">Sort: Default</option>
        <option value="company">Sort by Company (A-Z)</option>
        <option value="title">Sort by Title (A-Z)</option>
      </select>
    </div>

    <div class="status-summary" id="statusSummary">
      Showing ${jobs.length} of ${jobs.length} ${statusText} jobs
    </div>

    <div class="jobs-grid" id="jobsGrid">
      ${jobCardsHtml}
    </div>

    <div class="no-results" id="noResults">
      No jobs match your filter criteria.
    </div>
  </div>

  <script>
    (function() {
      const searchInput = document.getElementById('searchInput');
      const sortSelect = document.getElementById('sortSelect');
      const jobsGrid = document.getElementById('jobsGrid');
      const noResults = document.getElementById('noResults');
      const statusSummary = document.getElementById('statusSummary');

      let cards = Array.from(jobsGrid.getElementsByClassName('job-card'));
      const totalCount = cards.length;

      function filterAndSort() {
        const query = searchInput.value.trim().toLowerCase();
        const sortValue = sortSelect.value;

        let visibleCards = cards.filter(card => {
          const title = card.getAttribute('data-title') || '';
          const company = card.getAttribute('data-company') || '';
          const location = card.getAttribute('data-location') || '';
          const matches = title.includes(query) || company.includes(query) || location.includes(query);
          card.style.display = matches ? 'block' : 'none';
          return matches;
        });

        if (sortValue === 'company') {
          visibleCards.sort((a, b) => (a.getAttribute('data-company') || '').localeCompare(b.getAttribute('data-company') || ''));
        } else if (sortValue === 'title') {
          visibleCards.sort((a, b) => (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || ''));
        } else {
          visibleCards.sort((a, b) => parseInt(a.getAttribute('data-index')) - parseInt(b.getAttribute('data-index')));
        }

        visibleCards.forEach(card => jobsGrid.appendChild(card));

        statusSummary.textContent = 'Showing ' + visibleCards.length + ' of ' + totalCount + ' newly discovered jobs';
        noResults.style.display = visibleCards.length === 0 ? 'block' : 'none';
      }

      searchInput.addEventListener('input', filterAndSort);
      sortSelect.addEventListener('change', filterAndSort);
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Saves the HTML content string to a file in the reports/ directory.
   * Output filename format: jobs-report-YYYY-MM-DD-HH-mm-ss.html
   */
  public static saveReportToFile(htmlContent: string, prefixFilename: string = 'jobs-report', outputDir?: string): string {
    const targetDir = outputDir || path.resolve(process.cwd(), 'reports');

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const filename = `${prefixFilename}-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.html`;
    const filePath = path.join(targetDir, filename);

    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    logger.info(`HTML Report successfully generated: ${filePath}`);
    return filePath;
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
