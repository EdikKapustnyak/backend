import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireFeature } from '../../middlewares/requireFeature.js';
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
// costs an Anthropic API call, gated behind the Business+ plan.
analyticsRouter.get(
  '/waste/narrative',
  requireFeature('ai'),
  validate({ query: wasteAnalyticsQuerySchema }),
  analyticsController.wasteAnalyticsNarrative,
);
