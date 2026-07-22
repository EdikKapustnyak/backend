import { registry, successResponse, commonErrorResponses, validationErrorResponse } from '../registry.js';
import { wasteAnalyticsQuerySchema } from '../../modules/analytics/analytics.schema.js';
import { wasteAnalyticsSchema, wasteAnalyticsNarrativeSchema, revenueAnalyticsSchema } from '../responseSchemas.js';

const TAG = 'Analytics';

registry.registerPath({
  method: 'get',
  path: '/analytics/waste',
  tags: [TAG],
  summary: 'Waste analytics (deterministic)',
  description: 'Pure MongoDB aggregation, no AI call - free, available on every plan. Defaults to the last 30 days if from/to are omitted.',
  request: { query: wasteAnalyticsQuerySchema },
  responses: {
    200: {
      description: 'Waste analytics summary',
      content: { 'application/json': { schema: successResponse(wasteAnalyticsSchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/analytics/waste/narrative',
  tags: [TAG],
  summary: 'Waste analytics + AI-written narrative',
  description:
    'Same numbers as GET /analytics/waste, plus an AI-written analysis and recommendations (calls the Anthropic API). Available on every plan.',
  request: { query: wasteAnalyticsQuerySchema },
  responses: {
    200: {
      description: 'Waste analytics + narrative',
      content: { 'application/json': { schema: successResponse(wasteAnalyticsNarrativeSchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/analytics/revenue',
  tags: [TAG],
  summary: 'Revenue analytics (deterministic)',
  description:
    'Aggregates manually-entered daily revenue receipts (Receipt.type = "daily_revenue") by calendar day. Pure MongoDB aggregation, no AI call. Defaults to the last 30 days if from/to are omitted.',
  request: { query: wasteAnalyticsQuerySchema },
  responses: {
    200: {
      description: 'Revenue analytics summary',
      content: { 'application/json': { schema: successResponse(revenueAnalyticsSchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
