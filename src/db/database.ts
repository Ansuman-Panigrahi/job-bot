import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import { Job } from '../models/job';
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
            url TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
          CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
        `;

        this.db!.exec(createTableSql, (execErr) => {
          if (execErr) {
            logger.error('Failed to initialize jobs table schema', execErr);
            return reject(execErr);
          }
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
        ? `SELECT id, source, title, company, location, experience, salary, url, created_at as createdAt FROM jobs ORDER BY created_at DESC LIMIT ?`
        : `SELECT id, source, title, company, location, experience, salary, url, created_at as createdAt FROM jobs ORDER BY created_at DESC`;
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
        INSERT INTO jobs (id, source, title, company, location, experience, salary, url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        job.id,
        job.source,
        job.title,
        job.company,
        job.location,
        job.experience,
        job.salary || null,
        job.url,
        job.createdAt,
      ];

      this.db!.run(sql, params, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}
