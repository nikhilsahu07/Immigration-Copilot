import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'resources', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Dedicated logger for adapter behavior.
 * Logs to resources/logs/adapter.log
 */
export const adapterLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'adapter.log'),
      maxsize: 10 * 1024 * 1024,  // 10MB
      maxFiles: 5,
    }),
  ],
});

/**
 * Logger specifically for AI automation failures.
 * Logs to resources/logs/ai_automation_failure.log
 */
export const aiFailureLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'ai_automation_failure.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

/**
 * Logger specifically for custom adapter failures.
 * Logs to resources/logs/custom_adapter_failure.log
 */
export const customAdapterFailureLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'custom_adapter_failure.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

/**
 * Helper class for adapter logging with context.
 */
export class AdapterLogHelper {
  constructor(
    private adapterSlug: string,
    private jobId?: string,
    private portalId?: string
  ) {}

  private getContext() {
    return {
      adapter: this.adapterSlug,
      jobId: this.jobId,
      portalId: this.portalId,
    };
  }

  info(message: string, meta?: Record<string, unknown>) {
    adapterLogger.info(message, { ...this.getContext(), ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>) {
    adapterLogger.warn(message, { ...this.getContext(), ...meta });
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>) {
    const errorMeta = error instanceof Error 
      ? { errorMessage: error.message, errorStack: error.stack }
      : { errorMessage: String(error) };
    adapterLogger.error(message, { ...this.getContext(), ...errorMeta, ...meta });
  }

  /**
   * Log an AI automation failure (also writes to dedicated failure log)
   */
  logAIFailure(message: string, meta: Record<string, unknown>) {
    aiFailureLogger.error(message, { ...this.getContext(), ...meta });
    adapterLogger.error(`[AI FAILURE] ${message}`, { ...this.getContext(), ...meta });
  }

  /**
   * Log a custom adapter failure (also writes to dedicated failure log)
   */
  logCustomAdapterFailure(message: string, meta: Record<string, unknown>) {
    customAdapterFailureLogger.error(message, { ...this.getContext(), ...meta });
    adapterLogger.error(`[CUSTOM ADAPTER FAILURE] ${message}`, { ...this.getContext(), ...meta });
  }
}
