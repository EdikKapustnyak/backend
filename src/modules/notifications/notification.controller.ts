import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { notificationRepository } from './notification.repository.js';
import { toPublicNotification } from './notification.service.js';
import { NotificationStatus, type NotificationType } from './notification.types.js';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../errors/index.js';

export const listNotifications = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const productId =
    typeof req.query['productId'] === 'string' ? req.query['productId'] : undefined;
  const warehouseId =
    typeof req.query['warehouseId'] === 'string' ? req.query['warehouseId'] : undefined;
  const type =
    typeof req.query['type'] === 'string' ? (req.query['type'] as NotificationType) : undefined;
  const status =
    typeof req.query['status'] === 'string'
      ? (req.query['status'] as NotificationStatus)
      : undefined;

  const { items, totalItems } = await notificationRepository.findManyInCompany(
    { companyId: req.auth.companyId, productId, warehouseId, type, status },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicNotification),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getNotification = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const notification = await notificationRepository.findByIdInCompany(
    req.params['id'] as string,
    req.auth.companyId,
  );
  if (!notification) throw new NotFoundError('Notification not found');

  sendSuccess(res, toPublicNotification(notification));
});

export const resolveNotification = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();
  const id = req.params['id'] as string;

  const existing = await notificationRepository.findByIdInCompany(id, req.auth.companyId);
  if (!existing) throw new NotFoundError('Notification not found');
  if (existing.status !== NotificationStatus.OPEN) {
    throw new ConflictError('Notification is already resolved');
  }

  const resolved = await notificationRepository.resolveById(id, req.auth.companyId);
  if (!resolved) throw new ConflictError('Notification is already resolved');

  sendSuccess(res, toPublicNotification(resolved), 'Notification resolved');
});
