import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

/** A string that must be a syntactically valid MongoDB ObjectId. */
export const objectIdString = z
  .string()
  .refine((value) => isValidObjectId(value), { message: 'Must be a valid identifier' });
