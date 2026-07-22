import { z } from 'zod';
import { registry, commonErrorResponses, validationErrorResponse } from '../registry.js';
import {
  purchasesReportQuerySchema,
  writeOffsReportQuerySchema,
  inventarizationsReportQuerySchema,
} from '../../modules/reports/report.schema.js';

const TAG = 'Reports';

const pdfResponse = (description: string) => ({
  200: {
    description,
    content: { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } },
  },
  422: validationErrorResponse,
  ...commonErrorResponses,
});

registry.registerPath({
  method: 'get',
  path: '/reports/purchases/pdf',
  tags: [TAG],
  summary: 'Purchases PDF report',
  description:
    'Streams a PDF (table + totals by supplier), capped at 2000 records. Any authenticated tenant member - reports are read-only. `lang` (ru/en/no, defaults to ru) controls the report\'s own text/date/number formatting - independent of any other setting, since the PDF is generated server-side.',
  request: { query: purchasesReportQuerySchema },
  responses: pdfResponse('PDF file stream'),
});

registry.registerPath({
  method: 'get',
  path: '/reports/write-offs/pdf',
  tags: [TAG],
  summary: 'Write-offs PDF report',
  description:
    'Streams a PDF (table + totals by reason), capped at 2000 records. `lang` (ru/en/no, defaults to ru) controls the report\'s own text/date/number formatting.',
  request: { query: writeOffsReportQuerySchema },
  responses: pdfResponse('PDF file stream'),
});

registry.registerPath({
  method: 'get',
  path: '/reports/inventarizations/pdf',
  tags: [TAG],
  summary: 'Inventarizations PDF report',
  description:
    'Streams a PDF: one row per inventarization (items/counted/large-discrepancy counts, highlighted in red), totals by warehouse. "Large" uses the same company thresholds as the inventarization_discrepancy notification. `lang` (ru/en/no, defaults to ru) controls the report\'s own text/date/number formatting.',
  request: { query: inventarizationsReportQuerySchema },
  responses: pdfResponse('PDF file stream'),
});
