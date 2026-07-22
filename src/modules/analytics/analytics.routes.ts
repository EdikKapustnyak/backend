import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { validate } from '../../middlewares/validate.js';
import { wasteAnalyticsQuerySchema } from './analytics.schema.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);
analyticsRouter.use(requireActiveSubscription);

// Deterministic numbers only - fast, free, no AI call. Available on every plan.
analyticsRouter.get(
  '/waste',
  validate({ query: wasteAnalyticsQuerySchema }),
  analyticsController.wasteAnalytics,
);

// Same numbers plus an AI-written narrative + recommendations - slower,
// costs an Anthropic API call. Available on every plan (confirmed decision -
// ADR-0001 originally proposed gating this behind Business+, see
// billing/plan.config.ts for where that was overridden).
analyticsRouter.get(
  '/waste/narrative',
  validate({ query: wasteAnalyticsQuerySchema }),
  analyticsController.wasteAnalyticsNarrative,
);

// Deterministic aggregation over manually-entered daily revenue receipts
// (Receipt.type = 'daily_revenue') - same shape/pattern as /waste above.
analyticsRouter.get(
  '/revenue',
  validate({ query: wasteAnalyticsQuerySchema }),
  analyticsController.revenueAnalytics,
);
