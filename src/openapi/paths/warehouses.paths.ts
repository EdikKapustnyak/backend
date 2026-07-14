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
  createWarehouseSchema,
  updateWarehouseSchema,
  listWarehousesQuerySchema,
} from '../../modules/warehouses/warehouse.schema.js';
import { publicWarehouseSchema } from '../responseSchemas.js';

const TAG = 'Warehouses';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Warehouse id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/warehouses',
  tags: [TAG],
  summary: 'List warehouses',
  request: { query: listWarehousesQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicWarehouseSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/warehouses/{id}',
  tags: [TAG],
  summary: 'Get one warehouse',
  request: idParam,
  responses: {
    200: { description: 'Warehouse', content: { 'application/json': { schema: successResponse(publicWarehouseSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/warehouses',
  tags: [TAG],
  summary: 'Create a warehouse',
  description: "owner/admin/manager only. Rejected at the plan's warehouse limit (see ADR-0001, billing/plan.config.ts).",
  request: { body: { content: { 'application/json': { schema: createWarehouseSchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: successResponse(publicWarehouseSchema) } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/warehouses/{id}',
  tags: [TAG],
  summary: 'Update name/location',
  description: 'owner/admin/manager only.',
  request: { params: idParam.params, body: { content: { 'application/json': { schema: updateWarehouseSchema } } } },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: successResponse(publicWarehouseSchema) } } },
    404: notFoundResponse,
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/warehouses/{id}',
  tags: [TAG],
  summary: 'Deactivate a warehouse (soft delete)',
  description:
    'owner/admin only. Sets isActive: false rather than physically deleting - warehouses are referenced by inventory/stock-movement history.',
  request: idParam,
  responses: {
    200: { description: 'Deactivated', content: { 'application/json': { schema: successResponse(publicWarehouseSchema) } } },
    404: notFoundResponse,
    409: {
      description: 'Already inactive',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    ...commonErrorResponses,
  },
});
