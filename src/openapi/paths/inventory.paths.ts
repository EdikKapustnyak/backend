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
  createInventorySchema,
  adjustInventorySchema,
  listInventoryQuerySchema,
} from '../../modules/inventory/inventory.schema.js';
import { publicInventorySchema } from '../responseSchemas.js';

const TAG = 'Inventory';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Inventory record id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/inventory',
  tags: [TAG],
  summary: 'List stock records',
  request: { query: listInventoryQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicInventorySchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/inventory/{id}',
  tags: [TAG],
  summary: 'Get one stock record',
  request: idParam,
  responses: {
    200: { description: 'Stock record', content: { 'application/json': { schema: successResponse(publicInventorySchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/inventory',
  tags: [TAG],
  summary: 'Create (or increment) a stock record for a product+warehouse',
  description: 'owner/admin/manager only.',
  request: { body: { content: { 'application/json': { schema: createInventorySchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: successResponse(publicInventorySchema) } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/inventory/{id}/adjust',
  tags: [TAG],
  summary: 'Apply an atomic delta to quantity and/or reserved',
  description:
    'owner/admin/manager only. The only way to change stock directly (no free-form "set to X") - atomically enforces quantity never goes negative and reserved never exceeds quantity. Purchases/write-offs/inventarization drive quantity through this same primitive internally.',
  request: {
    params: idParam.params,
    body: { content: { 'application/json': { schema: adjustInventorySchema } } },
  },
  responses: {
    200: { description: 'Adjusted', content: { 'application/json': { schema: successResponse(publicInventorySchema) } } },
    404: notFoundResponse,
    409: { description: 'Would make quantity negative or reserved exceed quantity', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
