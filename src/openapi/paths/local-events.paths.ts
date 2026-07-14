import { z } from 'zod';
import { registry, successResponse, commonErrorResponses } from '../registry.js';
import { publicLocalEventsSchema } from '../responseSchemas.js';

const TAG = 'Local Events';

registry.registerPath({
  method: 'get',
  path: '/local-events',
  tags: [TAG],
  summary: 'AI + web-search event recommendations for the company city',
  description:
    "Finds events in the company's city that could affect foot traffic. Cached 7 days per company (not per city - two companies in the same city get independent results if their businessType differs). Available on every plan. Requires `city` set on the company (already required at registration).",
  request: {
    query: z.object({
      refresh: z
        .enum(['true', 'false'])
        .optional()
        .openapi({ description: 'Bypass the cache and force a fresh AI + web-search call' }),
    }),
  },
  responses: {
    200: {
      description: 'Local events',
      content: { 'application/json': { schema: successResponse(publicLocalEventsSchema) } },
    },
    ...commonErrorResponses,
  },
});
