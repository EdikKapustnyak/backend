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
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from '../../modules/products/product.schema.js';
import { publicProductSchema } from '../responseSchemas.js';

const TAG = 'Products';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Product id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/products',
  tags: [TAG],
  summary: 'List products',
  description: '`search` matches name, SKU, and barcode.',
  request: { query: listProductsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicProductSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/products/{id}',
  tags: [TAG],
  summary: 'Get one product',
  request: idParam,
  responses: {
    200: { description: 'Product', content: { 'application/json': { schema: successResponse(publicProductSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/products',
  tags: [TAG],
  summary: 'Create a product',
  description: 'owner/admin/manager only. SKU and barcode are unique per company (barcode via a partial index, so multiple products with no barcode are fine).',
  request: { body: { content: { 'application/json': { schema: createProductSchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: successResponse(publicProductSchema) } } },
    409: { description: 'Duplicate SKU or barcode within the company', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/products/{id}',
  tags: [TAG],
  summary: 'Update a product',
  description: 'owner/admin/manager only. `sku` is immutable after creation (not in this schema) - treated as a stable identifier.',
  request: { params: idParam.params, body: { content: { 'application/json': { schema: updateProductSchema } } } },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: successResponse(publicProductSchema) } } },
    404: notFoundResponse,
    409: { description: 'Duplicate barcode within the company', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/products/{id}',
  tags: [TAG],
  summary: 'Deactivate a product (soft delete)',
  description: 'owner/admin only.',
  request: idParam,
  responses: {
    200: { description: 'Deactivated', content: { 'application/json': { schema: successResponse(publicProductSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});
