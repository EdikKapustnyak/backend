import * as XLSX from 'xlsx';
import {
  WAREHOUSE_SHEET_NAME,
  WAREHOUSE_COLUMNS,
  SUPPLIER_SHEET_NAME,
  SUPPLIER_COLUMNS,
  PRODUCT_SHEET_NAME,
  PRODUCT_COLUMNS,
  type ImportColumn,
} from './import.columns.js';

/** Reasonable default column width in Excel's "character count" unit - wide enough that headers/example values aren't truncated by default. */
const DEFAULT_COLUMN_WIDTH = 22;

function buildSheet(columns: ImportColumn[], exampleRow: (string | number)[]): XLSX.WorkSheet {
  const headerRow = columns.map((col) => col.header);
  const sheet = XLSX.utils.aoa_to_sheet([headerRow, exampleRow]);
  sheet['!cols'] = columns.map(() => ({ wch: DEFAULT_COLUMN_WIDTH }));
  return sheet;
}

/**
 * Builds the downloadable .xlsx import template - one sheet per entity
 * (Warehouses, Suppliers, Products), a header row matching
 * import.columns.ts exactly (fields marked with * are required), and one
 * filled-in example row so the expected format is obvious without reading
 * separate instructions. Columns are independent - Products don't
 * reference Warehouses/Suppliers by row, since the Product model itself
 * has no such relationship (that only happens later, via Purchases).
 */
export function buildImportTemplate(): Buffer {
  const workbook = XLSX.utils.book_new();

  const warehouseSheet = buildSheet(WAREHOUSE_COLUMNS, ['Главный склад', 'ул. Ленина, 10']);
  XLSX.utils.book_append_sheet(workbook, warehouseSheet, WAREHOUSE_SHEET_NAME);

  const supplierSheet = buildSheet(SUPPLIER_COLUMNS, [
    'ООО «Кофе-Трейд»',
    'Иван Петров',
    '+7 900 123-45-67',
    'sales@coffee-trade.example',
    'г. Москва, ул. Складская, 5',
    'Оплата по факту поставки',
  ]);
  XLSX.utils.book_append_sheet(workbook, supplierSheet, SUPPLIER_SHEET_NAME);

  const productSheet = buildSheet(PRODUCT_COLUMNS, [
    'Кофе в зёрнах Arabica 1кг',
    'COF-ARB-1KG',
    'Кофе',
    650,
    990,
    'шт',
    10,
    '4600000000001',
  ]);
  XLSX.utils.book_append_sheet(workbook, productSheet, PRODUCT_SHEET_NAME);

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
