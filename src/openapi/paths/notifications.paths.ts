import { z } from 'zod';
import { registry, successResponse, paginatedListSchema, commonErrorResponses, notFoundResponse } from '../registry.js';
import { listNotificationsQuerySchema } from '../../modules/notifications/notification.schema.js';
import { publicNotificationSchema } from '../responseSchemas.js';

const TAG = 'Notifications';
const idParam = { params: z.object({ id: z.string().openapi({ description: 'Notification id' }) }) };

registry.registerPath({
  method: 'get',
  path: '/notifications',
  tags: [TAG],
  summary: 'List notifications',
  description:
    'No POST exists - notifications (low_stock, inventarization_discrepancy) are only ever system-generated as a side effect of stock-changing operations.',
  request: { query: listNotificationsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: { 'application/json': { schema: successResponse(paginatedListSchema(publicNotificationSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/notifications/{id}',
  tags: [TAG],
  summary: 'Get one notification',
  request: idParam,
  responses: {
    200: {
      description: 'Notification',
      content: { 'application/json': { schema: successResponse(publicNotificationSchema) } },
    },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/notifications/{id}/resolve',
  tags: [TAG],
  summary: 'Acknowledge/dismiss a notification',
  description: 'Any authenticated tenant member.',
  request: idParam,
  responses: {
    200: {
      description: 'Resolved',
      content: { 'application/json': { schema: successResponse(publicNotificationSchema) } },
    },
    404: notFoundResponse,
    ...commonErrorResponses,
  },
});
