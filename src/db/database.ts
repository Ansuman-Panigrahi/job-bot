import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import { Job } from '../models/job';
import { AIAnalysis, AnalyzedJob } from '../models/analysis';
import { logger } from '../utils/logger';

export class JobDatabase {
  private db: sqlite3.Database | null = null;
  private readonly dbPath: string;

  constructor(customPath?: string) {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = customPath || path.join(dataDir, 'jobs.db');
  }

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error(`Failed to open SQLite database at ${this.dbPath}`, err);
          return reject(err);
        }

        const createTableSql = `
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT NOT NULL,
            experience TEXT NOT NULL,
            salary TEXT,
            posted_date TEXT,
            url TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
          CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

          CREATE TABLE IF NOT EXISTS job_analyses (
            job_id TEXT PRIMARY KEY,
            analysis_json TEXT NOT NULL,
            analysis_version INTEGER NOT NULL,
            prompt_version INTEGER NOT NULL,
            analyzed_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
          );
        `;

        this.db!.exec(createTableSql, (execErr) => {
          if (execErr) {
            logger.error('Failed to initialize jobs table schema', execErr);
            return reject(execErr);
          }
          // Migration check for pre-existing databases
          this.db!.run('ALTER TABLE jobs ADD COLUMN posted_date TEXT', () => {});
          this.db!.run('ALTER TABLE jobs ADD COLUMN description TEXT', () => {});
          logger.info(`SQLite Job Database initialized at ${this.dbPath}`);
          resolve();
        });
      });
    });
  }

  public static generateJobId(source: string, rawUrl: string): string {
    const normalizedSource = source.trim().toLowerCase();
    const normalizedUrl = rawUrl.trim().toLowerCase().split('?')[0]!;
    const payload = `${normalizedSource}|${normalizedUrl}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  public async saveJobs(jobs: Job[]): Promise<Job[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }

    const newlyDiscovered: Job[] = [];

    for (const job of jobs) {
      const jobId = job.id || JobDatabase.generateJobId(job.source, job.url);
      const createdAt = job.createdAt || new Date().toISOString();

      const exists = await this.jobExists(jobId);
      if (exists) {
        continue;
      }

      await this.insertJob({
        ...job,
        id: jobId,
        createdAt,
      });

      newlyDiscovered.push({
        ...job,
        id: jobId,
        createdAt,
      });
    }

    logger.info(`Database save complete: ${newlyDiscovered.length} new jobs inserted, ${jobs.length - newlyDiscovered.length} duplicate jobs skipped.`);
    return newlyDiscovered;
  }

  public async purgeOldJobs(daysAgo: number = 60): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM jobs WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')`;
      this.db!.run(sql, [daysAgo], function (err) {
        if (err) {
          logger.error(`Failed to purge jobs older than ${daysAgo} days`, err);
          return reject(err);
        }
        const deletedCount = this.changes || 0;
        if (deletedCount > 0) {
          logger.info(`Purged ${deletedCount} jobs older than ${daysAgo} days from database.`);
        }
        resolve(deletedCount);
      });
    });
  }

  public async getTotalJobsCount(): Promise<number> {
    if (!this.db) return 0;
    return new Promise((resolve, reject) => {
      this.db!.get(`SELECT COUNT(*) as count FROM jobs`, (err, row: any) => {
        if (err) return reject(err);
        resolve(row ? row.count : 0);
      });
    });
  }

  public async getAllJobs(limit?: number): Promise<Job[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const sql = limit
        ? `SELECT id, source, title, company, location, experience, salary, posted_date as postedDate, url, description, created_at as createdAt FROM jobs ORDER BY created_at DESC LIMIT ?`
        : `SELECT id, source, title, company, location, experience, salary, posted_date as postedDate, url, description, created_at as createdAt FROM jobs ORDER BY created_at DESC`;
      const params = limit ? [limit] : [];
      this.db!.all(sql, params, (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  public async close(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          logger.error('Failed closing database connection', err);
          return reject(err);
        }
        this.db = null;
        logger.info('Database connection closed.');
        resolve();
      });
    });
  }

  private async jobExists(jobId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.get(`SELECT 1 FROM jobs WHERE id = ?`, [jobId], (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      });
    });
  }

  private async insertJob(job: Job): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO jobs (id, source, title, company, location, experience, salary, posted_date, url, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        job.id,
        job.source,
        job.title,
        job.company,
        job.location,
        job.experience,
        job.salary || null,
        job.postedDate || null,
        job.url,
        job.description || null,
        job.createdAt,
      ];

      this.db!.run(sql, params, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async updateJobDescription(jobId: string, description: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized.');
    return new Promise((resolve, reject) => {
      const sql = `UPDATE jobs SET description = ? WHERE id = ?`;
      this.db!.run(sql, [description, jobId], (err) => {
        if (err) {
          logger.error(`Failed to update job description for ID: ${jobId}`, err);
          return reject(err);
        }
        resolve();
      });
    });
  }

  public async saveAnalysis(analysis: AIAnalysis): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized.');
    }

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO job_analyses (job_id, analysis_json, analysis_version, prompt_version, analyzed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          analysis_json = excluded.analysis_json,
          analysis_version = excluded.analysis_version,
          prompt_version = excluded.prompt_version,
          analyzed_at = excluded.analyzed_at
      `;

      const analysisData = {
        score: analysis.score,
        recommendation: analysis.recommendation,
        summary: analysis.summary,
        strengths: analysis.strengths,
        missingSkills: analysis.missingSkills,
        reasons: analysis.reasons
      };

      const params = [
        analysis.jobId,
        JSON.stringify(analysisData),
        analysis.analysisVersion,
        analysis.promptVersion,
        analysis.analyzedAt,
      ];

      this.db!.run(sql, params, (err) => {
        if (err) {
          logger.error(`Failed to save analysis for job ${analysis.jobId}`, err);
          return reject(err);
        }
        resolve();
      });
    });
  }

  public async getAnalysisForJob(jobId: string): Promise<AIAnalysis | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const sql = `SELECT job_id, analysis_json, analysis_version, prompt_version, analyzed_at FROM job_analyses WHERE job_id = ?`;
      this.db!.get(sql, [jobId], (err, row: any) => {
        if (err) {
          logger.error(`Failed to get analysis for job ${jobId}`, err);
          return reject(err);
        }
        if (!row) return resolve(null);

        try {
          const data = JSON.parse(row.analysis_json);
          resolve({
            jobId: row.job_id,
            score: data.score,
            recommendation: data.recommendation,
            summary: data.summary,
            strengths: data.strengths || [],
            missingSkills: data.missingSkills || [],
            reasons: data.reasons || [],
            analysisVersion: row.analysis_version,
            promptVersion: row.prompt_version,
            analyzedAt: row.analyzed_at,
          });
        } catch (parseErr) {
          logger.error(`Failed to parse analysis JSON for job ${jobId}`, parseErr);
          resolve(null);
        }
      });
    });
  }

  public async getAllAnalyzedJobs(limit?: number): Promise<AnalyzedJob[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const sql = limit
        ? `
          SELECT 
            j.id, j.source, j.title, j.company, j.location, j.experience, j.salary, j.posted_date as postedDate, j.url, j.created_at as createdAt,
            a.analysis_json, a.analysis_version, a.prompt_version, a.analyzed_at
          FROM jobs j
          LEFT JOIN job_analyses a ON j.id = a.job_id
          ORDER BY j.created_at DESC
          LIMIT ?
        `
        : `
          SELECT 
            j.id, j.source, j.title, j.company, j.location, j.experience, j.salary, j.posted_date as postedDate, j.url, j.created_at as createdAt,
            a.analysis_json, a.analysis_version, a.prompt_version, a.analyzed_at
          FROM jobs j
          LEFT JOIN job_analyses a ON j.id = a.job_id
          ORDER BY j.created_at DESC
        `;
      const params = limit ? [limit] : [];

      this.db!.all(sql, params, (err, rows: any[]) => {
        if (err) {
          logger.error('Failed to get all analyzed jobs', err);
          return reject(err);
        }

        const results: AnalyzedJob[] = (rows || []).map((row) => {
          const job: Job = {
            id: row.id,
            source: row.source,
            title: row.title,
            company: row.company,
            location: row.location,
            experience: row.experience,
            salary: row.salary || undefined,
            postedDate: row.postedDate || undefined,
            url: row.url,
            createdAt: row.createdAt,
          };

          let analysis: AIAnalysis | undefined;
          if (row.analysis_json) {
            try {
              const data = JSON.parse(row.analysis_json);
              analysis = {
                jobId: row.id,
                score: data.score,
                recommendation: data.recommendation,
                summary: data.summary,
                strengths: data.strengths || [],
                missingSkills: data.missingSkills || [],
                reasons: data.reasons || [],
                analysisVersion: row.analysis_version,
                promptVersion: row.prompt_version,
                analyzedAt: row.analyzed_at,
              };
            } catch (parseErr) {
              logger.error(`Failed to parse analysis_json in getAllAnalyzedJobs for job ${row.id}`, parseErr);
            }
          }

          return { job, analysis };
        });

        resolve(results);
      });
    });
  }
}
