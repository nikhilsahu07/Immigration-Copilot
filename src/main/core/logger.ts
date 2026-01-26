import winston from 'winston';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const logDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'logs')
  : path.join(__dirname, '../../resources/logs');

// Ensure log directory exists before Winston tries to write.
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // Avoid crashing at import-time; Winston transports may fail later if the dir truly isn't writable.
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
    }),
  ],
});

// Create automation-specific logger
export const automationLogger = logger.child({ service: 'automation' });

function createPlainFileLogger(filename: string) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, filename),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 3,
      }),
    ],
  });
}

// More granular automation logs (separate files per area)
export const automationNavigationLogger = createPlainFileLogger('automation_navigation.log');
export const automationFillingLogger = createPlainFileLogger('automation_filling.log');
export const automationMappingLogger = createPlainFileLogger('automation_mapping.log');
export const automationPageLogger = createPlainFileLogger('automation_page.log');

// Loop & checkpoint specific logs for pause/resume debugging
export const automationLoopLogger = createPlainFileLogger('automation_loop.log');
export const automationCheckpointLogger = createPlainFileLogger('automation_checkpoint.log');

// New dedicated loggers for parallel batch and field fill operations
export const automationBatchLogger = createPlainFileLogger('automation_batch.log');
export const fieldFillLogger = createPlainFileLogger('field_fill.log');

// Raw HTML context log (cleaned HTML sent as optional context)
export const rawHtmlContextLogger = createPlainFileLogger('raw_html_structure.log');

// Structured HTML fields log (clean JSON  canonicalFields[] structure)
export const htmlFieldsStructureLogger = createPlainFileLogger('html_fields_structure.log');

// Create gemini prompt logger
export const geminiPromptLogger = winston.createLogger({
  level: 'info',
  format: winston.format.printf(({ message }) => {
    return message as string;
  }),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'gemini_prompt.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

// Create gemini response logger (kept separate from structured Winston logs on purpose)
export const geminiResponseLogger = winston.createLogger({
  level: 'info',
  format: winston.format.printf(({ message }) => {
    return message as string;
  }),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'gemini_response.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

// Sanitize sensitive data from logs
export function sanitizeForLog(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'passwordHash', 'apiKey', 'secret', 'token', 'accessKey'];
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}
