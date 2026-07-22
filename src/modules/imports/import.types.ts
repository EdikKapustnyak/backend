import type { ImportEntityType } from './import.columns.js';

export interface ImportRowError {
  /** 1-based row number as it appears in the spreadsheet (header row is row 1, so the first data row is row 2). */
  row: number;
  message: string;
}

export interface ImportSheetResult {
  createdCount: number;
  errors: ImportRowError[];
}

export interface ImportReport {
  warehouses: ImportSheetResult;
  suppliers: ImportSheetResult;
  products: ImportSheetResult;
}

// ---------------------------------------------------------------------------
// Preview + AI-assisted column mapping (any sheet/header names, not just
// the downloadable template's) - see import.mapping.service.ts.
// ---------------------------------------------------------------------------

export interface SheetPreview {
  sheetName: string;
  /** Raw header row as found in the file - whatever text the user actually used. */
  headers: string[];
  /** First few data rows, for the UI to show a preview and for the AI prompt. */
  sampleRows: string[][];
  /** AI's best guess at which entity this sheet represents - null if none fit well enough to suggest. */
  suggestedEntityType: ImportEntityType | null;
  /** AI's best guess at field -> header mapping, for suggestedEntityType's fields. Empty if suggestedEntityType is null. */
  suggestedMapping: Record<string, string | null>;
}

export interface ImportPreviewResult {
  sheets: SheetPreview[];
}

export interface SheetMappingInput {
  sheetName: string;
  entityType: ImportEntityType;
  /** field -> exact header text in this sheet. Fields omitted here are treated as not provided (same as an empty cell). */
  columnMapping: Record<string, string>;
}

export interface ImportMappingInput {
  sheets: SheetMappingInput[];
}
