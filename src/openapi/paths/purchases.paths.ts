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
  createPurchaseSchema,
  updatePurchaseSchema,
  listPurchasesQuerySchema,
} from '../../modules/purchases/purchase.schema.js';
import { publicPurchaseSchema } from '../responseSchemas.js';

const TAG = 'Purchases';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Purchase id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/purchases',
  tags: [TAG],
  summary: 'List purchases',
  request: { query: listPurchasesQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicPurchaseSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/purchases/{id}',
  tags: [TAG],
  summary: 'Get one purchase',
  request: idParam,
  responses: {
    200: { description: 'Purchase', content: { 'application/json': { schema: successResponse(publicPurchaseSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/purchases',
  tags: [TAG],
  summary: 'Create a draft purchase',
  description: 'owner/admin/manager only. No stock change yet - only on completion.',
  request: { body: { content: { 'application/json': { schema: createPurchaseSchema } } } },
  responses: {
    201: { description: 'Draft created', content: { 'application/json': { schema: successResponse(publicPurchaseSchema) } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/purchases/{id}',
  tags: [TAG],
  summary: 'Update a draft purchase',
  description: 'owner/admin/manager only. Only drafts can be edited.',
  request: { params: idParam.params, body: { content: { 'application/json': { schema: updatePurchaseSchema } } } },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: successResponse(publicPurchaseSchema) } } },
    404: notFoundResponse,
    409: { description: 'Not a draft anymore', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/purchases/{id}/complete',
  tags: [TAG],
  summary: 'Complete a draft purchase',
  description:
    'owner/admin/manager only. Transactional: increases stock for every item, writes stock-movement history, checks low-stock thresholds. draft \u2192 completed.',
  request: idParam,
  responses: {
    200: { description: 'Completed', content: { 'application/json': { schema: successResponse(publicPurchaseSchema) } } },
    404: notFoundResponse,
    409: { description: 'Not a draft anymore', content: { 'application/json': { schema: errorResponseSchema } } },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/purchases/{id}/cancel',
  tags: [TAG],
  summary: 'Cancel a draft purchase',
  description: 'owner/admin/manager only. draft \u2192 cancelled, no stock change.',
  request: idParam,
  responses: {
    200: { description: 'Cancelled', content: { 'application/json': { schema: successResponse(publicPurchaseSchema) } } },
    404: notFoundResponse,
    409: { description: 'Not a draft anymore', content: { 'application/json': { schema: errorResponseSchema } } },
    ...commonErrorResponses,
  },
});
