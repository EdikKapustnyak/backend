import { z } from 'zod';
import { objectIdString } from '../../utils/objectId.js';
import { NotificationStatus, NotificationType } from './notification.types.js';

export const listNotificationsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  productId: objectIdString.optional(),
  warehouseId: objectIdString.optional(),
  type: z.nativeEnum(NotificationType).optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
