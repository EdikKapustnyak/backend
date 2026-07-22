import * as XLSX from 'xlsx';
import { z } from 'zod';
import { anthropicClient } from '../../utils/anthropicClient.js';
import { logger } from '../../utils/logger.js';
import { BadRequestError } from '../../errors/index.js';
import { ENTITY_COLUMNS, type ImportEntityType } from './import.columns.js';
import type { SheetPreview, ImportPreviewResult } from './import.types.js';

/**
 * AI-assisted column mapping - lets a user upload their own spreadsheet
 * (any sheet names, any column headers, any column order) instead of
 * being forced to reshape their data into our exact template. Claude
 * looks at each sheet's headers + a few sample rows and suggests which of
 * our three entities it represents and how its columns map to our
 * fields; the user reviews/edits that suggestion before anything is
 * actually imported (see import.service.ts#importFromXlsxWithMapping).
 * Never writes anything - purely a suggestion step.
 */

const MAX_SHEETS = 10;
const MAX_SAMPLE_ROWS = 3;

const suggestionSchema = z.object({
  entityType: z.enum(['warehouse', 'supplier', 'product']).nullable(),
  mapping: z.record(z.string(), z.string().nullable()),
});

function describeEntityFields(entityType: ImportEntityType): string {
  return ENTITY_COLUMNS[entityType]
    .map((col) => `${col.field}${col.required ? ' (required)' : ''} - ${col.type}`)
    .join(', ');
}

function buildPrompt(sheetName: string, headers: string[], sampleRows: string[][]): string {
  const sampleLines = sampleRows.map((row) => row.join(' | ')).join('\n');

  return `
You are helping map a spreadsheet's columns to one of three known data types for a bulk-import feature in an inventory management app. The spreadsheet may be in any language and may use any header names or column order - your job is to figure out the best match.

Known data types and their fields:
- warehouse: ${describeEntityFields('warehouse')}
- supplier: ${describeEntityFields('supplier')}
- product: ${describeEntityFields('product')}

Sheet name: "${sheetName}"
Column headers (in file order): ${headers.map((h) => `"${h}"`).join(', ')}
Sample data rows (pipe-separated, same column order as headers):
${sampleLines || '(no data rows)'}

Decide which ONE of the three data types (warehouse, supplier, product) this sheet most likely represents. If it clearly doesn't match any of them, use null for entityType and an empty mapping.

If you did pick a data type, map each of ITS fields to the EXACT header text from the list above that best corresponds to it (copy the header text exactly as given, including case), or null if no column matches that field.

Respond with ONLY a JSON object in this exact shape, no markdown fences, no explanation:
{
  "entityType": "warehouse" | "supplier" | "product" | null,
  "mapping": { "<field>": "<exact header text or null>", ... }
}
`.trim();
}

async function suggestMappingForSheet(
  sheetName: string,
  headers: string[],
  sampleRows: string[][],
): Promise<{ entityType: ImportEntityType | null; mapping: Record<string, string | null> }> {
  try {
    const raw = await anthropicClient.askClaudeForJson<unknown>(buildPrompt(sheetName, headers, sampleRows));
    const parsed = suggestionSchema.parse(raw);
    return parsed;
  } catch (err) {
    // Degrades gracefully - this is a convenience suggestion, not a
    // requirement. Worst case the user maps this sheet by hand.
    logger.error({ err, sheetName }, 'AI column-mapping suggestion failed for one sheet - falling back to no suggestion');
    return { entityType: null, mapping: {} };
  }
}

export async function previewImportWorkbook(fileBuffer: Buffer): Promise<ImportPreviewResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch {
    throw new BadRequestError('Could not read this file as an Excel (.xlsx) workbook');
  }

  const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS);
  const sheets: SheetPreview[] = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // header: 1 -> array-of-arrays (raw rows), so we control header
    // detection ourselves instead of assuming row 1 is a clean header row.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const headerRow: unknown[] = rows[0] ?? [];
    const headers = headerRow
      .map((h: unknown) => (h === null || h === undefined ? '' : String(h)))
      .filter((h: string) => h !== '');
    if (headers.length === 0) continue; // blank/empty sheet - nothing to suggest

    const sampleRows = rows
      .slice(1, 1 + MAX_SAMPLE_ROWS)
      .map((row: unknown[]) => row.map((v: unknown) => (v === null || v === undefined ? '' : String(v))));

    const suggestion = await suggestMappingForSheet(sheetName, headers, sampleRows);

    sheets.push({
      sheetName,
      headers,
      sampleRows,
      suggestedEntityType: suggestion.entityType,
      suggestedMapping: suggestion.mapping,
    });
  }

  return { sheets };
}
