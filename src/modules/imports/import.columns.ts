/**
 * Canonical field definitions per entity - used to build the downloadable
 * template (import.template.ts), to drive the AI mapping suggestion
 * (import.mapping.service.ts), and to interpret a user-confirmed mapping
 * when actually importing (import.service.ts). `header` here is only the
 * *default/example* header text used in the template - a real uploaded
 * file can use any header text at all, since mapping is now explicit
 * (field -> whatever header the user's own file actually has), not
 * assumed from fixed column names.
 */
export interface ImportColumn {
  /** Default header text shown in the downloadable template. */
  header: string;
  /** Canonical field name - the key used in the confirmed mapping and in the Zod create-schema. */
  field: string;
  required: boolean;
  /** Determines whether cell values are read as text or coerced to a number before validation. */
  type: 'string' | 'number';
}

export type ImportEntityType = 'warehouse' | 'supplier' | 'product';

export const WAREHOUSE_SHEET_NAME = 'Склады';
export const WAREHOUSE_COLUMNS: ImportColumn[] = [
  { header: 'Название*', field: 'name', required: true, type: 'string' },
  { header: 'Адрес', field: 'location', required: false, type: 'string' },
];

export const SUPPLIER_SHEET_NAME = 'Поставщики';
export const SUPPLIER_COLUMNS: ImportColumn[] = [
  { header: 'Название*', field: 'name', required: true, type: 'string' },
  { header: 'Контактное лицо', field: 'contactPerson', required: false, type: 'string' },
  { header: 'Телефон', field: 'phone', required: false, type: 'string' },
  { header: 'Email', field: 'email', required: false, type: 'string' },
  { header: 'Адрес', field: 'address', required: false, type: 'string' },
  { header: 'Заметки', field: 'notes', required: false, type: 'string' },
];

export const PRODUCT_SHEET_NAME = 'Товары';
export const PRODUCT_COLUMNS: ImportColumn[] = [
  { header: 'Название*', field: 'name', required: true, type: 'string' },
  { header: 'SKU*', field: 'sku', required: true, type: 'string' },
  { header: 'Категория', field: 'category', required: false, type: 'string' },
  { header: 'Закупочная цена*', field: 'purchasePrice', required: true, type: 'number' },
  { header: 'Цена продажи*', field: 'salePrice', required: true, type: 'number' },
  { header: 'Ед. изм.', field: 'unit', required: false, type: 'string' },
  { header: 'Мин. остаток', field: 'minStockLevel', required: false, type: 'number' },
  { header: 'Штрихкод', field: 'barcode', required: false, type: 'string' },
];

export const ENTITY_COLUMNS: Record<ImportEntityType, ImportColumn[]> = {
  warehouse: WAREHOUSE_COLUMNS,
  supplier: SUPPLIER_COLUMNS,
  product: PRODUCT_COLUMNS,
};

export const ENTITY_SHEET_NAMES: Record<ImportEntityType, string> = {
  warehouse: WAREHOUSE_SHEET_NAME,
  supplier: SUPPLIER_SHEET_NAME,
  product: PRODUCT_SHEET_NAME,
};
