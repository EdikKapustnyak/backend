import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { BadRequestError } from '../errors/index.js';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB - matches middlewares/upload.ts's receipt limit

/**
 * Separate multer instance from middlewares/upload.ts (which is
 * image/PDF-only, for receipts) - a bulk import file is a different kind
 * of upload with a different allowed type, and reusing/parameterizing the
 * receipts uploader would risk that module accepting xlsx too if the
 * allowlist were ever merged carelessly.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== XLSX_MIME_TYPE) {
      cb(new BadRequestError(`Unsupported file type: ${file.mimetype}. Allowed: XLSX`));
      return;
    }
    cb(null, true);
  },
});

export function uploadSingleXlsxFile(fieldName: string) {
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
