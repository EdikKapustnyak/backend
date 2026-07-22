import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';
import { PurchaseStatus } from '../purchases/purchase.types.js';
import { WriteOffReason, WriteOffStatus } from '../write-offs/write-off.types.js';
import { InventarizationStatus } from '../inventarizations/inventarization.types.js';
import { REPORT_LANGUAGE_VALUES } from '../../i18n/reportLanguage.js';

/** Accepts "2026-01-01" as well as full ISO timestamps. */
const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date' })
  .transform((value) => new Date(value));

/** Defaults to 'ru' - matches the report's pre-existing behavior for any client that doesn't send this yet. */
const langQuery = z.enum(REPORT_LANGUAGE_VALUES).optional().default('ru');

export const purchasesReportQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    supplierId: objectIdString.optional(),
    warehouseId: objectIdString.optional(),
    status: z.nativeEnum(PurchaseStatus).optional(),
    lang: langQuery,
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" must be before or equal to "to"',
  });

export const writeOffsReportQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    productId: objectIdString.optional(),
    warehouseId: objectIdString.optional(),
    reason: z.nativeEnum(WriteOffReason).optional(),
    status: z.nativeEnum(WriteOffStatus).optional(),
    lang: langQuery,
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" must be before or equal to "to"',
  });

export const inventarizationsReportQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    warehouseId: objectIdString.optional(),
    status: z.nativeEnum(InventarizationStatus).optional(),
    lang: langQuery,
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" must be before or equal to "to"',
  });

export type PurchasesReportQuery = z.infer<typeof purchasesReportQuerySchema>;
export type WriteOffsReportQuery = z.infer<typeof writeOffsReportQuerySchema>;
export type InventarizationsReportQuery = z.infer<typeof inventarizationsReportQuerySchema>;
