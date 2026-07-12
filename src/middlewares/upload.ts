import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { BadRequestError } from '../errors/index.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(
        new BadRequestError(
          `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, PDF`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/**
 * Wraps multer's single-file upload as ordinary Express middleware,
 * translating its errors (wrong type, too large) into our AppError shape
 * so they come back through the standard { success: false, error } JSON
 * envelope instead of multer's raw error format.
 */
export function uploadSingleFile(fieldName: string) {
  const middleware = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new BadRequestError(`File too large - max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`));
        return;
      }
      next(err);
    });
  };
}
