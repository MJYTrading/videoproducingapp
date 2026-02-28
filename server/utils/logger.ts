/**
 * Pipeline Logger Helper
 * 
 * Gebruik:
 *   const log = createPipelineLogger(projectId);
 *   await log.info(5, 'App', 'Timestamps gestart');
 *   await log.info(5, 'Assembly AI', 'Transcriptie klaar', { wordCount: 342 }, 12500);
 *   await log.error(5, 'Assembly AI', 'Transcriptie mislukt', { error: err.message });
 */
import prisma from '../db.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface PipelineLogger {
  debug: (step: number, source: string, message: string, detail?: any, durationMs?: number) => Promise<void>;
  info:  (step: number, source: string, message: string, detail?: any, durationMs?: number) => Promise<void>;
  warn:  (step: number, source: string, message: string, detail?: any, durationMs?: number) => Promise<void>;
  error: (step: number, source: string, message: string, detail?: any, durationMs?: number) => Promise<void>;
}

async function writeLog(projectId: string, level: LogLevel, step: number, source: string, message: string, detail?: any, durationMs?: number) {
  try {
    await prisma.logEntry.create({
      data: {
        projectId,
        level,
        step,
        source,
        message,
        detail: detail ? JSON.stringify(detail) : null,
        durationMs: durationMs || null,
      },
    });
  } catch (err: any) {
    console.error(`[Logger] Failed to write log: ${err.message}`);
  }
}

export function createPipelineLogger(projectId: string): PipelineLogger {
  return {
    debug: (step, source, message, detail?, durationMs?) => writeLog(projectId, 'debug', step, source, message, detail, durationMs),
    info:  (step, source, message, detail?, durationMs?) => writeLog(projectId, 'info',  step, source, message, detail, durationMs),
    warn:  (step, source, message, detail?, durationMs?) => writeLog(projectId, 'warn',  step, source, message, detail, durationMs),
    error: (step, source, message, detail?, durationMs?) => writeLog(projectId, 'error', step, source, message, detail, durationMs),
  };
}

/** Shorthand: start timer, returns function that gives elapsed ms */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
