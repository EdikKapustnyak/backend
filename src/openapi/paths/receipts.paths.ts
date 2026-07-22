import { z } from 'zod';
import {
  registry,
  successResponse,
  paginatedListSchema,
  commonErrorResponses,
  notFoundResponse,
  validationErrorResponse,
} from '../registry.js';
import { requestUploadUrlSchema, confirmUploadSchema, updateReceiptSchema, listReceiptsQuerySchema } from '../../modules/receipts/receipt.schema.js';
import { ReceiptType } from '../../modules/receipts/receipt.types.js';
import { publicReceiptSchema, receiptOcrResultResponseSchema } from '../responseSchemas.js';

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
  path: '/receipts/{id}/ocr',
  tags: [TAG],
  summary: 'Extract amount/date/category from a receipt photo via OCR (Claude vision)',
  description:
    'Read-only suggestion - never modifies the receipt itself. Apply the result via PATCH /receipts/{id} if it looks right. Image receipts only (JPEG/PNG/WEBP) - PDF receipts return 400. Available on every plan, like the other AI features.',
  request: idParam,
  responses: {
    200: {
      description: 'Extracted fields (any of which may be null if unreadable)',
      content: { 'application/json': { schema: successResponse(receiptOcrResultResponseSchema) } },
    },
    400: { description: 'Unsupported file type for OCR (e.g. PDF)' },
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
  method: 'post',
  path: '/receipts/upload-url',
  tags: [TAG],
  summary: 'Step 1/2 - get a signed URL to upload a receipt file directly to R2',
  description:
    'Any authenticated tenant member - including employee. Returns a short-lived signed PUT URL - upload the file straight to it (matching Content-Type), then call POST /receipts/confirm with the returned fileKey. The file never passes through this API server. Same allowed types as the multipart endpoint above (JPEG/PNG/WEBP/PDF, 10MB max).',
  request: { body: { content: { 'application/json': { schema: requestUploadUrlSchema } } } },
  responses: {
    200: {
      description: 'Signed upload URL',
      content: {
        'application/json': {
          schema: successResponse(z.object({ uploadUrl: z.string(), fileKey: z.string() })),
        },
      },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/receipts/confirm',
  tags: [TAG],
  summary: 'Step 2/2 - create the receipt record after uploading to the signed URL',
  description:
    'Re-verifies the file actually exists at fileKey (and reads its real size/type back from R2) before creating anything - a signed PUT URL only grants permission to upload, it does not prove the client used it.',
  request: { body: { content: { 'application/json': { schema: confirmUploadSchema } } } },
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
