import * as XLSX from 'xlsx';
import type { ZodSchema } from 'zod';
import { createWarehouseSchema } from '../warehouses/warehouse.schema.js';
import { createSupplierSchema } from '../suppliers/supplier.schema.js';
import { createProductSchema } from '../products/product.schema.js';
import { warehouseRepository } from '../warehouses/warehouse.repository.js';
import { supplierRepository } from '../suppliers/supplier.repository.js';
import { productRepository } from '../products/product.repository.js';
import { billingService } from '../billing/billing.service.js';
import { AppError, BadRequestError } from '../../errors/index.js';
import { ENTITY_COLUMNS, type ImportColumn, type ImportEntityType } from './import.columns.js';
import type {
  ImportMappingInput,
  ImportReport,
  ImportRowError,
  ImportSheetResult,
} from './import.types.js';

/**
 * Caps rows processed per sheet - same "bulk operation needs a sane upper
 * bound" reasoning as REPORT_MAX_RECORDS elsewhere in this codebase.
 */
const MAX_ROWS_PER_SHEET = 2000;

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

function describeDuplicateKey(err: MongoDuplicateKeyError): string {
  const fields = err.keyValue ? Object.keys(err.keyValue).filter((k) => k !== 'companyId') : [];
  if (fields.length === 0) return 'A record with these values already exists in this company';
  return `${fields.join(', ')} already exists in this company`;
}

/** Blank/absent-cell normalization: xlsx.sheet_to_json's `defval: null` fills untouched cells with null, but the create schemas' `.optional()` fields only accept `undefined`, not `null`. */
function cellToOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str === '' ? undefined : str;
}

function cellToOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return parsed; // NaN passes through deliberately - z.number() rejects NaN with a clear message, no need to special-case it here
}

function mergeSheetResults(a: ImportSheetResult, b: ImportSheetResult): ImportSheetResult {
  return { createdCount: a.createdCount + b.createdCount, errors: [...a.errors, ...b.errors] };
}

/**
 * Builds one row's candidate object generically from `entityColumns` (the
 * canonical field list for this entity) and `columnMapping` (field ->
 * whatever header text this particular sheet actually uses) - this is
 * what lets the same code handle a sheet with completely different
 * headers/order than our template, as long as the user (or the AI
 * suggestion) mapped each field to the right column.
 */
function buildCandidateFromMapping(
  row: Record<string, unknown>,
  entityColumns: ImportColumn[],
  columnMapping: Record<string, string>,
): Record<string, unknown> {
  const candidate: Record<string, unknown> = {};
  for (const col of entityColumns) {
    const headerText = columnMapping[col.field];
    const rawValue = headerText !== undefined ? row[headerText] : undefined;
    candidate[col.field] = col.type === 'number' ? cellToOptionalNumber(rawValue) : cellToOptionalString(rawValue);
  }
  return candidate;
}

/**
 * Runs one sheet through: parse rows -> build a candidate object per row
 * (using the confirmed column mapping, not fixed header names) -> validate
 * via `schema` (the exact same schema the regular POST endpoint uses -
 * single source of truth for what's valid) -> create via `createRow`. One
 * bad row never aborts the rest - each row succeeds or fails
 * independently, matching the "skip invalid rows, report them" behavior
 * chosen for this feature over all-or-nothing.
 */
async function processSheet<TInput>(
  workbook: XLSX.WorkBook,
  sheetName: string,
  entityColumns: ImportColumn[],
  columnMapping: Record<string, string>,
  schema: ZodSchema<TInput>,
  createRow: (input: TInput, rowNumber: number) => Promise<void>,
): Promise<ImportSheetResult> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      createdCount: 0,
      errors: [{ row: 0, message: `Sheet "${sheetName}" was not found in the uploaded file` }],
    };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const errors: ImportRowError[] = [];
  let createdCount = 0;

  const limitedRows = rows.slice(0, MAX_ROWS_PER_SHEET);
  if (rows.length > MAX_ROWS_PER_SHEET) {
    errors.push({
      row: MAX_ROWS_PER_SHEET + 2,
      message: `Sheet has more than ${MAX_ROWS_PER_SHEET} rows - only the first ${MAX_ROWS_PER_SHEET} were processed`,
    });
  }

  for (const [index, row] of limitedRows.entries()) {
    // Row 1 is the header, so the first data row is row 2.
    const rowNumber = index + 2;
    const candidate = buildCandidateFromMapping(row, entityColumns, columnMapping);
    const parsed = schema.safeParse(candidate);

    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
        .join('; ');
      errors.push({ row: rowNumber, message });
      continue;
    }

    try {
      await createRow(parsed.data, rowNumber);
      createdCount += 1;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        errors.push({ row: rowNumber, message: describeDuplicateKey(err) });
      } else if (err instanceof AppError) {
        errors.push({ row: rowNumber, message: err.message });
      } else {
        errors.push({ row: rowNumber, message: 'Unexpected error creating this row' });
      }
    }
  }

  return { createdCount, errors };
}

/**
 * Imports every sheet listed in `mappingInput`, using each sheet's
 * confirmed entity type + column mapping - not fixed sheet/header names.
 * The mapping normally comes from import.mapping.service.ts's AI
 * suggestion, reviewed/edited by the user in the UI, but nothing here
 * requires that - a fully hand-built mapping works exactly the same way.
 *
 * Warehouses are processed first among any warehouse-mapped sheets (so
 * the running plan-limit count stays correct across sheets), though nothing
 * here actually depends on import order otherwise, since Product has no
 * direct reference to Warehouse or Supplier (that relationship only
 * exists later, via Purchases).
 */
export async function importFromXlsxWithMapping(
  companyId: string,
  fileBuffer: Buffer,
  mappingInput: ImportMappingInput,
): Promise<ImportReport> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch {
    throw new BadRequestError('Could not read this file as an Excel (.xlsx) workbook');
  }

  const results: Record<ImportEntityType, ImportSheetResult> = {
    warehouse: { createdCount: 0, errors: [] },
    supplier: { createdCount: 0, errors: [] },
    product: { createdCount: 0, errors: [] },
  };

  let warehouseCount = await warehouseRepository.countActiveInCompany(companyId);

  const sheetsByEntity: Record<ImportEntityType, typeof mappingInput.sheets> = {
    warehouse: [],
    supplier: [],
    product: [],
  };
  for (const sheetMapping of mappingInput.sheets) {
    sheetsByEntity[sheetMapping.entityType].push(sheetMapping);
  }

  for (const sheetMapping of sheetsByEntity.warehouse) {
    const result = await processSheet(
      workbook,
      sheetMapping.sheetName,
      ENTITY_COLUMNS.warehouse,
      sheetMapping.columnMapping,
      createWarehouseSchema,
      async (input) => {
        await billingService.assertResourceLimit(companyId, 'warehouses', warehouseCount);
        await warehouseRepository.create({ companyId, ...input });
        warehouseCount += 1;
      },
    );
    results.warehouse = mergeSheetResults(results.warehouse, result);
  }

  for (const sheetMapping of sheetsByEntity.supplier) {
    const result = await processSheet(
      workbook,
      sheetMapping.sheetName,
      ENTITY_COLUMNS.supplier,
      sheetMapping.columnMapping,
      createSupplierSchema,
      async (input) => {
        await supplierRepository.create({ companyId, ...input });
      },
    );
    results.supplier = mergeSheetResults(results.supplier, result);
  }

  for (const sheetMapping of sheetsByEntity.product) {
    const result = await processSheet(
      workbook,
      sheetMapping.sheetName,
      ENTITY_COLUMNS.product,
      sheetMapping.columnMapping,
      createProductSchema,
      async (input) => {
        await productRepository.create({
          companyId,
          ...input,
          unit: input.unit ?? 'pcs',
          minStockLevel: input.minStockLevel ?? 0,
        });
      },
    );
    results.product = mergeSheetResults(results.product, result);
  }

  return { warehouses: results.warehouse, suppliers: results.supplier, products: results.product };
}
