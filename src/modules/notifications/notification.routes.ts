import { Router } from 'express';
import * as notificationController from './notification.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { listNotificationsQuerySchema } from './notification.schema.js';

export const notificationRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see notification.controller.ts), never from the client.
notificationRouter.use(authenticate);

// Read-only, plus a resolve action - there is intentionally no POST here.
// Notifications are only ever created as a side effect of stock-changing
// operations in other modules - see notification.service.ts.
notificationRouter.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  notificationController.listNotifications,
);

notificationRouter.get('/:id', isValidId(), notificationController.getNotification);

// Any authenticated tenant member can acknowledge/dismiss an alert.
notificationRouter.patch(
  '/:id/resolve',
  isValidId(),
  notificationController.resolveNotification,
);
