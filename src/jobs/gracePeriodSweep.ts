import { companyRepository } from '../modules/companies/company.repository.js';
import { GRACE_PERIOD_DAYS } from '../modules/billing/plan.config.js';
import { logger } from '../utils/logger.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Proactive companion to billing.service.ts's escalateIfGracePeriodElapsed
 * (lazy, per-request escalation). That function only fires when someone
 * makes an authenticated write request or logs in - a company that stops
 * making requests entirely during its grace period never gets escalated
 * by it. This sweep closes that gap by scanning on a timer instead of
 * waiting for activity, so PAST_DUE -> SUSPENDED happens even for a fully
 * dormant company. Stripe's own subscription cancellation webhook remains
 * the actual backstop either way (see billing.service.ts, handleWebhookEvent) -
 * this only affects how promptly our own DB reflects that a company's
 * grace period ran out.
 */
export async function sweepExpiredGracePeriods(): Promise<number> {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * MS_PER_DAY);
  const suspendedCount = await companyRepository.suspendExpiredGracePeriods(cutoff);
  if (suspendedCount > 0) {
    logger.info({ suspendedCount }, 'Grace period sweep: suspended companies past their grace period');
  }
  return suspendedCount;
}

/**
 * Starts the periodic sweep and returns a stop function for graceful
 * shutdown (see server.ts). Intentionally only wired from server.ts's
 * main(), never from app.ts - the test suite builds the app via
 * createApp() directly and never calls main(), so tests naturally never
 * start this interval and don't need an explicit NODE_ENV guard.
 */
export function startGracePeriodSweep(intervalMs: number): () => void {
  // Run once immediately on boot (a long-idle server shouldn't have to
  // wait a full interval before its first sweep), then on the timer.
  void sweepExpiredGracePeriods().catch((err: unknown) => {
    logger.error({ err }, 'Grace period sweep failed');
  });

  const timer = setInterval(() => {
    void sweepExpiredGracePeriods().catch((err: unknown) => {
      logger.error({ err }, 'Grace period sweep failed');
    });
  }, intervalMs);

  // Don't let this interval alone keep the process alive.
  timer.unref();

  return () => clearInterval(timer);
}
