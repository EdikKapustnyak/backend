import type { NextFunction, Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { BadRequestError } from '../errors/index.js';

/**
 * Validates that req.params[paramName] is a well-formed MongoDB ObjectId.
 * Defaults to checking the "id" param.
 */
export function isValidId(paramName = 'id') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.params[paramName];

    if (!value || !isValidObjectId(value)) {
      next(new BadRequestError(`"${paramName}" is not a valid identifier`));
      return;
    }

    next();
  };
}
