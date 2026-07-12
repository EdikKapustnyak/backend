import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { wasteAnalyticsQuerySchema } from './analytics.schema.js';

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

// Deterministic numbers only - fast, free, no AI call.
analyticsRouter.get(
  '/waste',
  validate({ query: wasteAnalyticsQuerySchema }),
  analyticsController.wasteAnalytics,
);

// Same numbers plus an AI-written narrative + recommendations - slower,
// costs an Anthropic API call.
analyticsRouter.get(
  '/waste/narrative',
  validate({ query: wasteAnalyticsQuerySchema }),
  analyticsController.wasteAnalyticsNarrative,
);
