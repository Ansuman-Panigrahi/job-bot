import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  headless: boolean;
  defaultTimeout: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config: AppConfig = {
  headless: parseBoolean(process.env.HEADLESS, true),
  defaultTimeout: parseIntOrDefault(process.env.DEFAULT_TIMEOUT, 30000),
  logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) || 'info',
};
