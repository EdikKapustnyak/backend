import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';

/**
 * Defense-in-depth guard for routes that also carry a :companyId route param
 * (e.g. nested resource routes). The source of truth for tenant identity is
 * ALWAYS req.auth.companyId (derived from the verified JWT); this middleware
 * only rejects requests where a client-supplied companyId param disagrees
 * with it, preventing tenant spoofing via the URL.
 */
export function enforceTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new UnauthorizedError());
    return;
  }

  const paramCompanyId = req.params['companyId'];
  if (paramCompanyId && paramCompanyId !== req.auth.companyId) {
    next(new ForbiddenError('Cross-tenant access is not allowed'));
    return;
  }

  next();
}
