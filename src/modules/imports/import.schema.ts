import { z } from 'zod';

const MAX_SHEETS = 10;

export const sheetMappingSchema = z.object({
  sheetName: z.string().min(1).max(200),
  entityType: z.enum(['warehouse', 'supplier', 'product']),
  columnMapping: z.record(z.string(), z.string().min(1)),
});

export const importMappingInputSchema = z.object({
  sheets: z.array(sheetMappingSchema).min(1).max(MAX_SHEETS),
});

export type ImportMappingInputParsed = z.infer<typeof importMappingInputSchema>;
