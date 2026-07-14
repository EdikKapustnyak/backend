import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors/index.js';
import { companyRepository } from '../modules/companies/company.repository.js';
import { PLAN_LIMITS } from '../modules/billing/plan.config.js';

type Feature = 'ai';

/**
 * Must run after `authenticate`. Fetches the company fresh (not from the
 * JWT) since plan changes take effect immediately on the next request,
 * not on next login. Only 'ai' exists today (see plan.config.ts,
 * PlanLimits.aiFeatures) - add a case here if a second gated feature
 * shows up later.
 */
export function requireFeature(feature: Feature) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }

    const company = await companyRepository.findById(req.auth.companyId);
    if (!company) {
      next(new NotFoundError('Company not found'));
      return;
    }

    const limits = PLAN_LIMITS[company.subscriptionPlan];
    const enabled = feature === 'ai' ? limits.aiFeatures : false;

    if (!enabled) {
      next(
        new ForbiddenError(
          `This feature requires the Business plan or higher (your company is on ${company.subscriptionPlan}). Upgrade to continue.`,
        ),
      );
      return;
    }

    next();
  };
}
