import type { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = '',
  status = 200,
): Response {
  return res.status(status).json({
    success: true,
    data,
    message,
  });
}
