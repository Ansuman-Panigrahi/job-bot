import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AIAnalysis } from '../models/analysis';
import { Job } from '../models/job';

const PROMPT_VERSION = 1;
const ANALYSIS_VERSION = 1;

export class AIScorer {
  private resumeCache: string | null = null;
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    } else {
      logger.warn('GEMINI_API_KEY not configured. AI scoring will be disabled.');
    }
  }

  public isEnabled(): boolean {
    return config.aiEnabled && this.genAI !== null;
  }

  /**
   * Evaluates a single Job against the CV using Gemini API.
   * Gracefully returns a default response if Gemini fails.
   */
  public async scoreJob(job: Job, jdText: string): Promise<AIAnalysis> {
    const analyzedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      return this.getDefaultAnalysis(job.id || '', analyzedAt, 'AI Scoring is disabled (missing API key).');
    }

    try {
      const resume = await this.loadResume();
      if (!resume) {
        return this.getDefaultAnalysis(job.id || '', analyzedAt, 'Resume file is missing or empty.');
      }

      logger.info(`Running AI analysis for job: "${job.title}" at "${job.company}"`);

      const model = this.genAI!.getGenerativeModel({
        model: 'gemini-3.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              score: { type: SchemaType.INTEGER, description: 'Percentage match score from 0 to 100.' },
              recommendation: { type: SchemaType.STRING, description: 'One of: Apply, Skip, Review.' },
              summary: { type: SchemaType.STRING, description: 'A short 1-2 sentence match summary.' },
              strengths: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: 'Key match alignments.'
              },
              missingSkills: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: 'Missing skills or requirement gaps.'
              },
              reasons: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: 'Brief points justifying the match score.'
              }
            },
            required: ['score', 'recommendation', 'summary', 'strengths', 'missingSkills', 'reasons']
          }
        }
      }, { apiVersion: 'v1' });

      const prompt = `
You are an expert technical recruiter. Your task is to evaluate the following Job Description (JD) against the user's Resume/CV and provide a structured match analysis.

User's Resume/CV:
"""
${resume}
"""

Job Details:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Experience: ${job.experience}
- Salary: ${job.salary || 'Not specified'}
- Full Job Description:
"""
${jdText || 'No full description available.'}
"""

Instructions:
1. Provide a match score (0-100) representing how well the candidate fits the requirements.
2. Determine a recommendation: "Apply" (score >= 80), "Review" (score 50-79), or "Skip" (score < 50).
3. Draft a concise 1-2 sentence summary of the evaluation.
4. List up to 4 key strengths (where resume matches JD requirements).
5. List up to 4 missing skills, experience gaps, or technologies mentioned in the JD but not found in the resume.
6. Provide clear, brief reasons justifying the match score.

Return a JSON object conforming exactly to the requested schema.
`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = response.text();

      if (!jsonText) {
        throw new Error('Empty response received from Gemini.');
      }

      const data = JSON.parse(jsonText);

      return {
        jobId: job.id || '',
        score: typeof data.score === 'number' ? data.score : 0,
        recommendation: data.recommendation || 'Review',
        summary: data.summary || 'No summary provided.',
        strengths: Array.isArray(data.strengths) ? data.strengths : [],
        missingSkills: Array.isArray(data.missingSkills) ? data.missingSkills : [],
        reasons: Array.isArray(data.reasons) ? data.reasons : [],
        analysisVersion: ANALYSIS_VERSION,
        promptVersion: PROMPT_VERSION,
        analyzedAt,
      };

    } catch (err: any) {
      logger.error(`Gemini AI analysis failed for job: "${job.title}" at "${job.company}": ${err.message || err}`);
      return this.getDefaultAnalysis(job.id || '', analyzedAt, `AI evaluation failed: ${err.message || 'Unknown error'}`);
    }
  }

  public async scoreJobsConcurrently(
    jobs: Job[],
    jdMap: Map<string, string>
  ): Promise<AIAnalysis[]> {
    const results: AIAnalysis[] = [];
    const delayMs = 3000; // 3-second delay for free-tier rate-limit protection

    logger.info(`Beginning AI scoring for ${jobs.length} jobs sequentially with a ${delayMs}ms delay to protect free tier API quota`);

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const jdText = jdMap.get(job.url) || '';

      logger.info(`Evaluating job ${i + 1} of ${jobs.length}: "${job.title}"...`);
      const analysis = await this.scoreJob(job, jdText);
      results.push(analysis);

      if (i < jobs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    logger.info(`AI Scoring complete. Processed ${results.length} jobs.`);
    return results;
  }

  /**
   * Loads the CV/resume once from file and caches it.
   */
  private async loadResume(): Promise<string> {
    if (this.resumeCache !== null) {
      return this.resumeCache;
    }

    const possiblePaths = [
      path.resolve(process.cwd(), config.resumePath),
      path.resolve(process.cwd(), 'data', 'resume.pdf'),
      path.resolve(process.cwd(), 'data', 'resume.txt'),
      path.resolve(process.cwd(), 'data', 'resume.md'),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        try {
          const isPdf = filePath.toLowerCase().endsWith('.pdf');
          if (isPdf) {
            const dataBuffer = fs.readFileSync(filePath);
            const parser = new PDFParse({ data: dataBuffer });
            const parsed = await parser.getText();
            const text = (parsed.text || '').trim();
            if (text.length > 0) {
              logger.info(`Successfully parsed PDF resume from ${filePath}`);
              this.resumeCache = text;
              return text;
            }
          } else {
            const content = fs.readFileSync(filePath, 'utf-8').trim();
            if (content.length > 0) {
              logger.info(`Successfully loaded text resume from ${filePath}`);
              this.resumeCache = content;
              return content;
            }
          }
        } catch (err: any) {
          logger.error(`Error reading/parsing resume file at ${filePath}: ${err.message}`);
        }
      }
    }

    logger.warn('No valid resume text found in resume.pdf, resume.txt, or resume.md. AI evaluation will skip resume details.');
    this.resumeCache = '';
    return '';
  }

  /**
   * Returns a fallback default analysis on API failure.
   */
  private getDefaultAnalysis(jobId: string, analyzedAt: string, reason: string): AIAnalysis {
    return {
      jobId,
      score: 0,
      recommendation: 'Review',
      summary: `Manually review this job. (Reason: ${reason})`,
      strengths: [],
      missingSkills: [],
      reasons: [reason],
      analysisVersion: ANALYSIS_VERSION,
      promptVersion: PROMPT_VERSION,
      analyzedAt,
    };
  }
}
