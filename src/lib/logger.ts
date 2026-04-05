/**
 * Structured JSON logger.
 *
 * Outputs newline-delimited JSON to stdout/stderr so log aggregators
 * (Datadog, CloudWatch, Loki, etc.) can parse fields without regex.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('Reset password failed', { userId, error: e.message });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info:  (message: string, context?: Record<string, unknown>) => emit('info',  message, context),
  warn:  (message: string, context?: Record<string, unknown>) => emit('warn',  message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
