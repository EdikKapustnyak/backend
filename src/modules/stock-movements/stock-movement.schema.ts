import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';
import { StockMovementType } from './stock-movement.types.js';

export const listStockMovementsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  productId: objectIdString.optional(),
  warehouseId: objectIdString.optional(),
  type: z.nativeEnum(StockMovementType).optional(),
});

export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;
