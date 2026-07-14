import { z } from 'zod';
import {
  registry,
  successResponse,
  paginatedListSchema,
  commonErrorResponses,
  notFoundResponse,
  validationErrorResponse,
  errorResponseSchema,
} from '../registry.js';
import {
  createInventarizationSchema,
  recordCountsSchema,
  listInventarizationsQuerySchema,
} from '../../modules/inventarizations/inventarization.schema.js';
import { publicInventarizationSchema } from '../responseSchemas.js';

const TAG = 'Inventarizations';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Inventarization id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/inventarizations',
  tags: [TAG],
  summary: 'List inventarizations (stock counts)',
  request: { query: listInventarizationsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicInventarizationSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/inventarizations/{id}',
  tags: [TAG],
  summary: 'Get one inventarization',
  request: idParam,
  responses: {
    200: {
      description: 'Inventarization',
      content: { 'application/json': { schema: successResponse(publicInventarizationSchema) } },
    },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/inventarizations',
  tags: [TAG],
  summary: 'Start a draft count for a warehouse',
  description:
    'Any role, including employee, can start a count - usually whoever is physically walking the warehouse. Auto-includes every product currently in stock there, snapshotting its system quantity, unless `productIds` narrows it.',
  request: { body: { content: { 'application/json': { schema: createInventarizationSchema } } } },
  responses: {
    201: {
      description: 'Draft created',
      content: { 'application/json': { schema: successResponse(publicInventarizationSchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/inventarizations/{id}/count',
  tags: [TAG],
  summary: 'Record counted quantities (can be called repeatedly, partial counts allowed)',
  description: 'Any role, including employee. Atomic per-item update via arrayFilters - safe to call multiple times as counting progresses.',
  request: { params: idParam.params, body: { content: { 'application/json': { schema: recordCountsSchema } } } },
  responses: {
    200: {
      description: 'Counts recorded',
      content: { 'application/json': { schema: successResponse(publicInventarizationSchema) } },
    },
    404: notFoundResponse,
    409: { description: 'Not a draft anymore', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/inventarizations/{id}/complete',
  tags: [TAG],
  summary: 'Complete a count and reconcile stock to the physical count',
  description:
    'owner/admin/manager only. Requires every item to have a recorded count. Transactional: adjusts Inventory.quantity to match countedQuantity for each item, writes stock-movement history, flags large discrepancies (company-configurable thresholds). draft \u2192 completed.',
  request: idParam,
  responses: {
    200: {
      description: 'Completed',
      content: { 'application/json': { schema: successResponse(publicInventarizationSchema) } },
    },
    404: notFoundResponse,
    409: {
      description: 'Not a draft anymore, or not every item has been counted yet',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/inventarizations/{id}/cancel',
  tags: [TAG],
  summary: 'Cancel a draft count',
  description: 'owner/admin/manager only. draft \u2192 cancelled, no stock change.',
  request: idParam,
  responses: {
    200: {
      description: 'Cancelled',
      content: { 'application/json': { schema: successResponse(publicInventarizationSchema) } },
    },
    404: notFoundResponse,
    409: { description: 'Not a draft anymore', content: { 'application/json': { schema: errorResponseSchema } } },
    ...commonErrorResponses,
  },
});
