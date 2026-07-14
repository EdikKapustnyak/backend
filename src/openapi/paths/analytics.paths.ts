import { registry, successResponse, commonErrorResponses, validationErrorResponse } from '../registry.js';
import { wasteAnalyticsQuerySchema } from '../../modules/analytics/analytics.schema.js';
import { wasteAnalyticsSchema, wasteAnalyticsNarrativeSchema } from '../responseSchemas.js';

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
    'Same numbers as GET /analytics/waste, plus an AI-written analysis and recommendations (calls the Anthropic API). Requires the Business plan or higher - see requireFeature(\'ai\').',
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
