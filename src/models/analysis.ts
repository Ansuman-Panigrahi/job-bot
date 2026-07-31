import { Job } from './job';

export interface AIAnalysis {
  jobId: string;
  score: number;
  recommendation: string; // e.g. "Apply" | "Skip" | "Review"
  summary: string;
  strengths: string[];
  missingSkills: string[];
  reasons: string[];
  analysisVersion: number;
  promptVersion: number;
  analyzedAt: string;
}

export interface AnalyzedJob {
  job: Job;
  analysis?: AIAnalysis;
}
