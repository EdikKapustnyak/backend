import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import type { Role } from '../modules/users/user.types.js';

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 * Usage: router.delete('/:id', authenticate, requireRole(Role.OWNER, Role.ADMIN), ctrl)
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      next(new ForbiddenError('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}
