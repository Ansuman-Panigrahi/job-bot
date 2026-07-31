import fs from 'fs';
import path from 'path';
import { Job } from '../models/job';
import { AnalyzedJob } from '../models/analysis';
import { logger } from '../utils/logger';
import { ReportResult } from '../notification/models';

export interface ReportOptions {
  generatedAt?: Date;
  title?: string;
  reportType?: 'new' | 'all';
  keywords?: string[];
}

export class ReportGenerator {
  /**
   * Generates HTML report, writes to file, and returns structured ReportResult metadata.
   */
  public static generateAndSaveReport(
    analyzedJobs: AnalyzedJob[],
    options: ReportOptions & { prefixFilename?: string; outputDir?: string } = {}
  ): ReportResult | null {
    if (!analyzedJobs || analyzedJobs.length === 0) {
      return null;
    }

    const generatedAt = options.generatedAt || new Date();
    const html = this.generateReportHtml(analyzedJobs, { ...options, generatedAt });
    const prefix = options.prefixFilename || (options.reportType === 'all' ? 'all-jobs-report' : 'jobs-report');
    const filePath = this.saveReportToFile(html, prefix, options.outputDir);
    const fileName = path.basename(filePath);
    const sources = Array.from(new Set(analyzedJobs.map((item) => item.job.source || 'Naukri')));

    const topMatches = analyzedJobs
      .filter((item) => item.analysis !== undefined && item.analysis.score > 0)
      .map((item) => ({
        title: item.job.title,
        company: item.job.company,
        score: item.analysis!.score,
        url: item.job.url,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      html,
      filePath,
      fileName,
      jobCount: analyzedJobs.length,
      sources,
      keywords: options.keywords,
      generatedAt,
      topMatches: topMatches.length > 0 ? topMatches : undefined,
    };
  }

  /**
   * Generates a complete standalone HTML document string from an array of analyzed jobs.
   */
  public static generateReportHtml(analyzedJobs: AnalyzedJob[], options: ReportOptions = {}): string {
    const generatedAt = options.generatedAt || new Date();
    const reportTitle = options.title || (options.reportType === 'all' ? 'All Stored Jobs' : 'New Jobs Found');
    const badgeText = options.reportType === 'all' ? `${analyzedJobs.length} Total` : `${analyzedJobs.length} New`;
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

    const sources = Array.from(new Set(analyzedJobs.map((item) => item.job.source || 'Naukri'))).join(', ');

    const jobCardsHtml = analyzedJobs
      .map((item, index) => {
        const job = item.job;
        const analysis = item.analysis;

        const title = this.escapeHtml(job.title);
        const company = this.escapeHtml(job.company);
        const location = this.escapeHtml(job.location);
        const experience = this.escapeHtml(job.experience);
        const salary = job.salary ? this.escapeHtml(job.salary) : null;
        const postedDate = job.postedDate ? this.escapeHtml(job.postedDate) : null;
        const source = this.escapeHtml(job.source || 'Naukri');
        const url = this.escapeHtml(job.url);

        const score = analysis ? analysis.score : null;
        const recommendation = analysis ? analysis.recommendation : null;
        const hasAnalysis = !!analysis;
        const scoreClass = !hasAnalysis ? 'score-na' : score! >= 80 ? 'score-high' : score! >= 50 ? 'score-med' : 'score-low';

        return `
        <div class="job-card" 
             data-index="${index}" 
             data-title="${title.toLowerCase()}" 
             data-company="${company.toLowerCase()}" 
             data-location="${location.toLowerCase()}" 
             data-posted="${postedDate ? postedDate.toLowerCase() : ''}"
             data-score="${score !== null ? score : -1}">
          <h2 class="job-title">
            <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
          </h2>
          <div class="job-company">${company}</div>
          
          <div class="job-details">
            <div class="detail-item">📍 <span>${location}</span></div>
            <div class="detail-item">💼 <span>${experience}</span></div>
            ${salary ? `<div class="detail-item">💰 <span>${salary}</span></div>` : ''}
            ${postedDate ? `<div class="detail-item">📅 <span>${postedDate}</span></div>` : ''}
            <div class="detail-item"><span class="source-badge">${source}</span></div>
          </div>

          <div class="ai-analysis-container">
            ${hasAnalysis ? `
            <details class="ai-details-toggle">
              <summary class="ai-score-row">
                <span class="ai-icon">🤖</span> AI Fit Match: 
                <span class="score-badge ${scoreClass}">${score}% (${recommendation})</span>
                <span class="toggle-icon">▼</span>
              </summary>
              <div class="ai-details">
                <p class="ai-summary"><strong>Summary:</strong> ${this.escapeHtml(analysis!.summary)}</p>
                ${analysis!.strengths && analysis!.strengths.length > 0 ? `
                <div class="ai-lists">
                  <div class="ai-list-title align-green">✓ Strengths</div>
                  <ul class="ai-ul">
                    ${analysis!.strengths.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
                  </ul>
                </div>` : ''}
                ${analysis!.missingSkills && analysis!.missingSkills.length > 0 ? `
                <div class="ai-lists">
                  <div class="ai-list-title align-red">✗ Skill Gaps</div>
                  <ul class="ai-ul">
                    ${analysis!.missingSkills.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
                  </ul>
                </div>` : ''}
              </div>
            </details>
            ` : `
            <div class="ai-score-row">
              <span class="ai-icon">🤖</span> AI Fit Match: 
              <span class="score-badge ${scoreClass}">Not Evaluated</span>
            </div>
            `}
          </div>

          ${job.description ? `
          <div class="jd-container">
            <details class="jd-details-toggle">
              <summary class="jd-row-title">
                📋 Detailed Job Description
                <span class="toggle-icon">▼</span>
              </summary>
              <div class="jd-text-content">${this.escapeHtml(job.description)}</div>
            </details>
          </div>
          ` : ''}

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
  <title>${reportTitle} - ${formattedDate}</title>
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
      color: var(--text-main);
      font-weight: 500;
      margin-top: 2px;
    }

    .controls-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-input {
      flex: 1;
      min-width: 200px;
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-main);
      font-size: 14px;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent-color);
    }

    .sort-select {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-main);
      font-size: 14px;
      cursor: pointer;
    }

    .sort-select:focus {
      outline: none;
      border-color: var(--accent-color);
    }

    .status-summary {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 14px;
      padding-left: 4px;
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
      padding: 20px;
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

    .ai-analysis-container {
      background: #1c2128;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 14px;
      font-size: 13px;
    }

    .jd-container {
      background: #1c2128;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 14px;
      font-size: 13px;
    }

    .jd-details-toggle {
      width: 100%;
    }

    .jd-details-toggle summary {
      list-style: none;
      outline: none;
      cursor: pointer;
    }

    .jd-details-toggle summary::-webkit-details-marker {
      display: none;
    }

    .jd-row-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--text-heading);
      margin-bottom: 0;
    }

    .jd-details-toggle[open] .jd-row-title {
      margin-bottom: 8px;
    }

    .jd-details-toggle .toggle-icon {
      margin-left: auto;
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.2s ease;
    }

    .jd-details-toggle[open] .toggle-icon {
      transform: rotate(180deg);
    }

    .jd-text-content {
      border-top: 1px solid var(--border-color);
      padding-top: 8px;
      margin-top: 8px;
      color: var(--text-muted);
      white-space: pre-wrap;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      max-height: 250px;
      overflow-y: auto;
    }

    .ai-details-toggle {
      width: 100%;
    }

    .ai-details-toggle summary {
      list-style: none;
      outline: none;
      cursor: pointer;
    }

    .ai-details-toggle summary::-webkit-details-marker {
      display: none;
    }

    .ai-score-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--text-heading);
      margin-bottom: 0;
    }

    .ai-details-toggle[open] .ai-score-row {
      margin-bottom: 8px;
    }

    .ai-details-toggle .toggle-icon {
      margin-left: auto;
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.2s ease;
    }

    .ai-details-toggle[open] .toggle-icon {
      transform: rotate(180deg);
    }

    .score-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 12px;
    }

    .score-high {
      background-color: rgba(46, 204, 113, 0.15);
      color: #2ecc71;
      border: 1px solid rgba(46, 204, 113, 0.3);
    }

    .score-med {
      background-color: rgba(243, 156, 18, 0.15);
      color: #f39c12;
      border: 1px solid rgba(243, 156, 18, 0.3);
    }

    .score-low {
      background-color: rgba(231, 76, 60, 0.15);
      color: #e74c3c;
      border: 1px solid rgba(231, 76, 60, 0.3);
    }

    .score-na {
      background-color: rgba(137, 140, 141, 0.15);
      color: #8b949e;
      border: 1px solid rgba(137, 140, 141, 0.3);
    }

    .ai-details {
      border-top: 1px solid var(--border-color);
      padding-top: 8px;
      margin-top: 8px;
    }

    .ai-summary {
      color: var(--text-main);
      margin-bottom: 10px;
      line-height: 1.4;
    }

    .ai-lists {
      margin-top: 8px;
    }

    .ai-list-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .align-green {
      color: #2ecc71;
    }

    .align-red {
      color: #e74c3c;
    }

    .ai-ul {
      list-style-type: none;
      padding-left: 0;
    }

    .ai-ul li {
      position: relative;
      padding-left: 14px;
      margin-bottom: 3px;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.3;
    }

    .ai-ul li::before {
      content: "•";
      position: absolute;
      left: 3px;
      color: var(--text-muted);
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
          <div class="meta-value">${analyzedJobs.length} Jobs</div>
        </div>
      </div>
    </header>

    <div class="controls-bar">
      <input type="text" id="searchInput" class="search-input" placeholder="Search by title, company, or location..." />
      
      <select id="scoreFilterSelect" class="sort-select">
        <option value="all">Filter: All Scores</option>
        <option value="high">Score >= 80% (Apply)</option>
        <option value="med">Score >= 50% (Review)</option>
        <option value="low">Score < 50% (Skip)</option>
        <option value="unevaluated">Not Evaluated</option>
      </select>

      <select id="sortSelect" class="sort-select">
        <option value="default">Sort: Default</option>
        <option value="score">Sort: Match Score (High to Low)</option>
        <option value="date">Sort: Date Posted</option>
        <option value="company">Sort: Company (A-Z)</option>
        <option value="title">Sort: Title (A-Z)</option>
      </select>
    </div>

    <div class="status-summary" id="statusSummary">
      Showing ${analyzedJobs.length} of ${analyzedJobs.length} ${statusText} jobs
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
      const scoreFilterSelect = document.getElementById('scoreFilterSelect');
      const jobsGrid = document.getElementById('jobsGrid');
      const noResults = document.getElementById('noResults');
      const statusSummary = document.getElementById('statusSummary');

      let cards = Array.from(jobsGrid.getElementsByClassName('job-card'));
      const totalCount = cards.length;

      function filterAndSort() {
        const query = searchInput.value.trim().toLowerCase();
        const sortValue = sortSelect.value;
        const scoreFilterValue = scoreFilterSelect.value;

        let visibleCards = cards.filter(card => {
          // 1. Search Query Filter
          const title = card.getAttribute('data-title') || '';
          const company = card.getAttribute('data-company') || '';
          const location = card.getAttribute('data-location') || '';
          const matchesSearch = title.includes(query) || company.includes(query) || location.includes(query);

          // 2. Score Filter
          const score = parseInt(card.getAttribute('data-score') || '-1', 10);
          let matchesScore = true;
          
          if (scoreFilterValue === 'high') {
            matchesScore = (score >= 80);
          } else if (scoreFilterValue === 'med') {
            matchesScore = (score >= 50);
          } else if (scoreFilterValue === 'low') {
            matchesScore = (score >= 0 && score < 50);
          } else if (scoreFilterValue === 'unevaluated') {
            matchesScore = (score === -1);
          }

          const matches = matchesSearch && matchesScore;
          card.style.display = matches ? 'block' : 'none';
          return matches;
        });

        // 3. Sorting logic
        if (sortValue === 'company') {
          visibleCards.sort((a, b) => (a.getAttribute('data-company') || '').localeCompare(b.getAttribute('data-company') || ''));
        } else if (sortValue === 'title') {
          visibleCards.sort((a, b) => (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || ''));
        } else if (sortValue === 'date') {
          visibleCards.sort((a, b) => {
            const pA = a.getAttribute('data-posted') || '';
            const pB = b.getAttribute('data-posted') || '';
            return pA.localeCompare(pB);
          });
        } else if (sortValue === 'score') {
          visibleCards.sort((a, b) => {
            const sA = parseInt(a.getAttribute('data-score') || '-1', 10);
            const sB = parseInt(b.getAttribute('data-score') || '-1', 10);
            return sB - sA; // High to low
          });
        } else {
          visibleCards.sort((a, b) => parseInt(a.getAttribute('data-index')) - parseInt(b.getAttribute('data-index')));
        }

        visibleCards.forEach(card => jobsGrid.appendChild(card));

        statusSummary.textContent = 'Showing ' + visibleCards.length + ' of ' + totalCount + ' ${statusText} jobs';
        noResults.style.display = visibleCards.length === 0 ? 'block' : 'none';
      }

      searchInput.addEventListener('input', filterAndSort);
      sortSelect.addEventListener('change', filterAndSort);
      scoreFilterSelect.addEventListener('change', filterAndSort);
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Saves the HTML content string to a file in the reports/ directory.
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
