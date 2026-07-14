import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors/index.js';
import { companyRepository } from '../modules/companies/company.repository.js';
import { PLAN_LIMITS } from '../modules/billing/plan.config.js';

type Feature = 'ai';

/**
 * Not currently wired to any route - confirmed decision (see
 * billing/plan.config.ts) made AI available on every plan, so the one
 * feature this was built for (`'ai'`) never fails its check anymore.
 * Left in place as ready-to-use infrastructure for a future plan-gated
 * feature - add a case to the `feature === ...` ternary below and wire
 * `requireFeature('whatever')` into a route when that need shows up.
 *
 * Must run after `authenticate`. Fetches the company fresh (not from the
 * JWT) since plan changes take effect immediately on the next request,
 * not on next login.
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
          `This feature isn't available on the ${company.subscriptionPlan} plan. Upgrade to continue.`,
        ),
      );
      return;
    }

    next();
  };
}
