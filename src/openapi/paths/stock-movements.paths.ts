import { z } from 'zod';
import { registry, successResponse, paginatedListSchema, commonErrorResponses, notFoundResponse } from '../registry.js';
import { listStockMovementsQuerySchema } from '../../modules/stock-movements/stock-movement.schema.js';
import { publicStockMovementSchema } from '../responseSchemas.js';

const TAG = 'Stock Movements';

registry.registerPath({
  method: 'get',
  path: '/stock-movements',
  tags: [TAG],
  summary: 'List stock movements (read-only audit ledger)',
  description:
    'No POST exists for this resource - movements are only ever created as a side effect of purchase completion, write-off confirmation, inventarization completion, or a manual inventory adjustment.',
  request: { query: listStockMovementsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicStockMovementSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/stock-movements/{id}',
  tags: [TAG],
  summary: 'Get one stock movement',
  request: { params: z.object({ id: z.string().openapi({ description: 'Stock movement id' }) }) },
  responses: {
    200: {
      description: 'Stock movement',
      content: { 'application/json': { schema: successResponse(publicStockMovementSchema) } },
    },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});
