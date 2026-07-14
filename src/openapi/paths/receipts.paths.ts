import { z } from 'zod';
import {
  registry,
  successResponse,
  paginatedListSchema,
  commonErrorResponses,
  notFoundResponse,
  validationErrorResponse,
} from '../registry.js';
import { updateReceiptSchema, listReceiptsQuerySchema } from '../../modules/receipts/receipt.schema.js';
import { ReceiptType } from '../../modules/receipts/receipt.types.js';
import { publicReceiptSchema } from '../responseSchemas.js';

const TAG = 'Receipts';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Receipt id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/receipts',
  tags: [TAG],
  summary: 'List receipt photos',
  request: { query: listReceiptsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list - each item includes a fresh 15-minute signed viewUrl',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicReceiptSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/receipts/{id}',
  tags: [TAG],
  summary: 'Get one receipt',
  request: idParam,
  responses: {
    200: { description: 'Receipt', content: { 'application/json': { schema: successResponse(publicReceiptSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/receipts',
  tags: [TAG],
  summary: 'Upload a receipt photo',
  description:
    'Any authenticated tenant member - including employee - can upload; usually whoever is physically holding the receipt. multipart/form-data: `file` (the image/PDF) plus the same fields as the JSON body below.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary', description: 'The receipt image or PDF' }),
            type: z.nativeEnum(ReceiptType),
            category: z.string().max(100).optional(),
            amount: z.coerce.number().nonnegative().optional(),
            date: z.string().datetime().optional(),
            notes: z.string().max(1000).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'Uploaded', content: { 'application/json': { schema: successResponse(publicReceiptSchema) } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/receipts/{id}',
  tags: [TAG],
  summary: 'Update receipt metadata',
  description: 'owner/admin/manager only. Cannot replace the file itself, only category/amount/date/notes.',
  request: { params: idParam.params, body: { content: { 'application/json': { schema: updateReceiptSchema } } } },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: successResponse(publicReceiptSchema) } } },
    404: notFoundResponse,
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/receipts/{id}',
  tags: [TAG],
  summary: 'Deactivate a receipt (soft delete)',
  description: 'owner/admin/manager only. The underlying file in R2 is not deleted.',
  request: idParam,
  responses: {
    200: { description: 'Deactivated', content: { 'application/json': { schema: successResponse(publicReceiptSchema) } } },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});
