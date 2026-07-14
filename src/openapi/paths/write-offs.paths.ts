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
import { createWriteOffSchema, listWriteOffsQuerySchema } from '../../modules/write-offs/write-off.schema.js';
import { publicWriteOffSchema } from '../responseSchemas.js';

const TAG = 'Write-offs';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Write-off id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/write-offs',
  tags: [TAG],
  summary: 'List write-offs',
  request: { query: listWriteOffsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicWriteOffSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/write-offs/{id}',
  tags: [TAG],
  summary: 'Get one write-off',
  request: idParam,
  responses: {
    200: { description: 'Write-off', content: { 'application/json': { schema: successResponse(publicWriteOffSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/write-offs',
  tags: [TAG],
  summary: 'Create a draft write-off',
  description:
    'Any role, including employee, can create a draft - stock is untouched until confirmed. Stock-sufficiency is only checked at confirmation, not here.',
  request: { body: { content: { 'application/json': { schema: createWriteOffSchema } } } },
  responses: {
    201: { description: 'Draft created', content: { 'application/json': { schema: successResponse(publicWriteOffSchema) } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/write-offs/{id}/confirm',
  tags: [TAG],
  summary: 'Confirm a draft write-off',
  description:
    'owner/admin/manager only. Transactional: decreases stock, writes stock-movement history, checks low-stock thresholds. Rejected if stock is now insufficient. draft \u2192 confirmed.',
  request: idParam,
  responses: {
    200: { description: 'Confirmed', content: { 'application/json': { schema: successResponse(publicWriteOffSchema) } } },
    404: notFoundResponse,
    409: {
      description: 'Not a draft anymore, or insufficient stock',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/write-offs/{id}/cancel',
  tags: [TAG],
  summary: 'Cancel a draft write-off',
  description: 'owner/admin/manager only. draft \u2192 cancelled, no stock change.',
  request: idParam,
  responses: {
    200: { description: 'Cancelled', content: { 'application/json': { schema: successResponse(publicWriteOffSchema) } } },
    404: notFoundResponse,
    409: { description: 'Not a draft anymore', content: { 'application/json': { schema: errorResponseSchema } } },
    ...commonErrorResponses,
  },
});
