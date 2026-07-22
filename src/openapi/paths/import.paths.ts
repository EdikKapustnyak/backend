import { z } from 'zod';
import { registry, successResponse, commonErrorResponses, validationErrorResponse } from '../registry.js';

const TAG = 'Import';

const importRowErrorSchema = z.object({
  row: z.number().openapi({ description: 'Row number in the sheet (header is row 1, so first data row is 2)' }),
  message: z.string(),
});

const importSheetResultSchema = z.object({
  createdCount: z.number(),
  errors: z.array(importRowErrorSchema),
});

const importReportSchema = registry.register(
  'ImportReport',
  z.object({
    warehouses: importSheetResultSchema,
    suppliers: importSheetResultSchema,
    products: importSheetResultSchema,
  }),
);

const entityTypeSchema = z.enum(['warehouse', 'supplier', 'product']);

const sheetPreviewSchema = z.object({
  sheetName: z.string(),
  headers: z.array(z.string()).openapi({ description: 'Raw header row exactly as found in the file' }),
  sampleRows: z.array(z.array(z.string())).openapi({ description: 'First few data rows, for a preview' }),
  suggestedEntityType: entityTypeSchema.nullable().openapi({
    description: "Claude's best guess at which entity this sheet represents - null if none fit well enough",
  }),
  suggestedMapping: z
    .record(z.string(), z.string().nullable())
    .openapi({ description: 'field -> suggested header text (or null), for suggestedEntityType\'s fields' }),
});

const importPreviewResultSchema = registry.register(
  'ImportPreviewResult',
  z.object({ sheets: z.array(sheetPreviewSchema) }),
);

registry.registerPath({
  method: 'get',
  path: '/import/template',
  tags: [TAG],
  summary: 'Download an example .xlsx starting point',
  description:
    'owner/admin/manager only. Three sheets (Склады, Поставщики, Товары) with a header row and one example row each - a convenient starting point, not a required format. POST /import/xlsx/preview accepts any sheet/column names and suggests a mapping via AI.',
  responses: {
    200: {
      description: 'The .xlsx template file',
      content: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
          schema: { type: 'string', format: 'binary' },
        },
      },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/import/xlsx/preview',
  tags: [TAG],
  summary: 'Step 1/2 - preview a workbook and get an AI-suggested column mapping',
  description:
    'owner/admin/manager only. Accepts any .xlsx file - any sheet names, any column headers/order, does not need to match GET /import/template. Reads up to 10 sheets and, for each, asks Claude which of warehouse/supplier/product it most likely represents and how its columns map to our fields. Never writes anything. Review/edit the suggestion in the UI, then re-upload the same file to POST /import/xlsx with the confirmed mapping.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary', description: 'The .xlsx workbook' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Per-sheet preview + suggested mapping',
      content: { 'application/json': { schema: successResponse(importPreviewResultSchema) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/import/xlsx',
  tags: [TAG],
  summary: 'Step 2/2 - import Warehouses, Suppliers, and Products using a confirmed mapping',
  description:
    'owner/admin/manager only. Same file as POST /import/xlsx/preview, plus the confirmed (or hand-edited) mapping as a JSON string in the "mapping" field: { "sheets": [{ "sheetName": "...", "entityType": "warehouse"|"supplier"|"product", "columnMapping": { "<field>": "<exact header text in this file>" } }] }. Partial import: each row is validated and created independently through the exact same rules as the regular POST endpoints - one invalid or duplicate row does not abort the rest. The response reports what was actually created per entity, plus a message for every row that was skipped and why.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary', description: 'The .xlsx workbook (same file used for /preview)' }),
            mapping: z.string().openapi({ description: 'JSON-encoded ImportMappingInput - see description above' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import report',
      content: { 'application/json': { schema: successResponse(importReportSchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
