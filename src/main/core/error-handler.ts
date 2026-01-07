import { Result } from '../../shared/types';
import { ERROR_CODES, ERROR_MESSAGES, ErrorCode } from '../../shared/constants';
import { logger } from './logger';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(code: ErrorCode, message?: string, statusCode: number = 500) {
    super(message || ERROR_MESSAGES[code] || 'An error occurred');
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toResult<T>(): Result<T> {
    return {
      success: false,
      error: this.message,
      code: this.code,
    };
  }
}

export function createError(code: ErrorCode, customMessage?: string): AppError {
  return new AppError(code, customMessage);
}

export function handleError(error: unknown): Result<never> {
  if (error instanceof AppError) {
    logger.error(`AppError [${error.code}]: ${error.message}`);
    return error.toResult();
  }

  if (error instanceof Error) {
    logger.error(`Error: ${error.message}`, { stack: error.stack });
    return {
      success: false,
      error: error.message,
      code: ERROR_CODES.INTERNAL_ERROR,
    };
  }

  logger.error('Unknown error:', error);
  return {
    success: false,
    error: 'An unexpected error occurred',
    code: ERROR_CODES.INTERNAL_ERROR,
  };
}

export function success<T>(data: T): Result<T> {
  return {
    success: true,
    data,
  };
}

export function failure(error: string, code?: ErrorCode): Result<never> {
  return {
    success: false,
    error,
    code: code || ERROR_CODES.INTERNAL_ERROR,
  };
}

// Type guard for Result
export function isSuccess<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success;
}

export function isFailure<T>(result: Result<T>): result is { success: false; error: string } {
  return !result.success;
}
