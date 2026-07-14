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
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersQuerySchema,
} from '../../modules/suppliers/supplier.schema.js';
import { publicSupplierSchema } from '../responseSchemas.js';

const TAG = 'Suppliers';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Supplier id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/suppliers',
  tags: [TAG],
  summary: 'List suppliers',
  description: '`search` matches name, contact person, email, and phone.',
  request: { query: listSuppliersQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicSupplierSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/suppliers/{id}',
  tags: [TAG],
  summary: 'Get one supplier',
  request: idParam,
  responses: {
    200: { description: 'Supplier', content: { 'application/json': { schema: successResponse(publicSupplierSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/suppliers',
  tags: [TAG],
  summary: 'Create a supplier',
  description: 'owner/admin/manager only. Name is unique per company.',
  request: { body: { content: { 'application/json': { schema: createSupplierSchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: successResponse(publicSupplierSchema) } } },
    409: { description: 'Duplicate name within the company', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/suppliers/{id}',
  tags: [TAG],
  summary: 'Update a supplier',
  description: 'owner/admin/manager only.',
  request: { params: idParam.params, body: { content: { 'application/json': { schema: updateSupplierSchema } } } },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: successResponse(publicSupplierSchema) } } },
    404: notFoundResponse,
    409: { description: 'Duplicate name within the company', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/suppliers/{id}',
  tags: [TAG],
  summary: 'Deactivate a supplier (soft delete)',
  description: 'owner/admin only.',
  request: idParam,
  responses: {
    200: { description: 'Deactivated', content: { 'application/json': { schema: successResponse(publicSupplierSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});
