import dotenv from 'dotenv';

dotenv.config();

export const config = {
  headless: process.env.HEADLESS !== 'false',
  defaultTimeout: Number(process.env.DEFAULT_TIMEOUT) || 30000,
  searchKeywords: (process.env.SEARCH_KEYWORDS || 'Angular Developer')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean),
  searchLocation: process.env.SEARCH_LOCATION || 'Bangalore',
  searchExperience: process.env.SEARCH_EXPERIENCE || '2',
  maxResults: Number(process.env.MAX_RESULTS) || 50,
  generateAllJobsReport: process.env.GENERATE_ALL_JOBS_REPORT === 'true',
  emailEnabled: process.env.EMAIL_ENABLED === 'true',
  emailFrom: process.env.EMAIL_FROM || '',
  emailTo: process.env.EMAIL_TO || '',
  gmailUser: process.env.GMAIL_USER || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
  postedDaysLimit: Number(process.env.POSTED_DAYS_LIMIT) || 0,
};
