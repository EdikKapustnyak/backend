import type { NextFunction, Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../errors/index.js';
import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1. Known, operational application errors.
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, path: req.originalUrl }, err.message);
    }
    res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Zod validation errors that slipped through outside the validate() middleware.
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.flatten(),
      },
    });
    return;
  }

  // 3. Mongoose schema validation errors.
  if (err instanceof MongooseError.ValidationError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: Object.values(err.errors).map((e) => e.message),
      },
    });
    return;
  }

  // 4. Malformed ObjectId passed straight to a Mongoose query.
  if (err instanceof MongooseError.CastError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid value for field "${err.path}"`,
      },
    });
    return;
  }

  // 5. Duplicate unique-index key (e.g. email or slug already taken).
  if (isDuplicateKeyError(err)) {
    const keys = err.keyValue ? Object.keys(err.keyValue) : [];
    // Our compound tenant-scoped indexes are always { companyId, <field> } -
    // companyId is never the meaningful part of the message to the user.
    const field = keys.find((key) => key !== 'companyId') ?? keys[0] ?? 'field';
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `${field} already exists`,
      },
    });
    return;
  }

  // 6. Anything else is an unexpected/programming error - never leak details.
  const error = err instanceof Error ? err : new Error('Unknown error');
  logger.error({ err: error, path: req.originalUrl }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again later.',
      ...(isProduction ? {} : { debug: error.message }),
    },
  });
}
