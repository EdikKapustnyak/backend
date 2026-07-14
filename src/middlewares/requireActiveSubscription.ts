import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors/index.js';
import { companyRepository } from '../modules/companies/company.repository.js';
import { CompanyStatus } from '../modules/companies/company.types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Must run after `authenticate`. Reads always pass regardless of
 * subscription status - a company mid-grace-period (or even fully
 * suspended) can still see its own data, just not create or change more
 * of it (see ADR-0001, Decision Area 3). Fetches the company fresh on
 * every write request rather than trusting anything in the JWT, since
 * status can change at any moment (a Stripe webhook, not a re-login).
 */
export async function requireActiveSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (!req.auth) {
    next(new UnauthorizedError());
    return;
  }

  const company = await companyRepository.findById(req.auth.companyId);
  if (!company) {
    next(new NotFoundError('Company not found'));
    return;
  }

  if (company.status === CompanyStatus.SUSPENDED) {
    next(new ForbiddenError('This company account is suspended. Contact billing to reactivate.'));
    return;
  }

  if (company.status === CompanyStatus.PAST_DUE) {
    next(
      new ForbiddenError(
        'Your subscription payment is past due. Update your payment method to continue making changes.',
      ),
    );
    return;
  }

  next();
}
