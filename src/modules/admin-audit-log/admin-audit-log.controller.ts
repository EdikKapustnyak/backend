import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { UnauthorizedError } from '../../errors/index.js';
import { auditLogRepository } from './admin-audit-log.repository.js';
import { platformAdminRepository } from '../platform-admin/admin.repository.js';
import type { AuditLogActionType } from './admin-audit-log.types.js';
import type { AuditLogDocument } from './admin-audit-log.model.js';
import type { PublicAuditLogEntry } from './admin-audit-log.types.js';

function toPublicEntry(doc: AuditLogDocument): PublicAuditLogEntry {
  return {
    id: doc._id.toString(),
    adminEmail: doc.adminEmail,
    type: doc.type,
    what: doc.what,
    companyId: doc.companyId ? doc.companyId.toString() : null,
    companyName: doc.companyName,
    reason: doc.reason,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const listAuditLog = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const adminId = req.query['adminId'] as string | undefined;
  const type = req.query['type'] as AuditLogActionType | undefined;
  const sinceRaw = req.query['since'] as string | undefined;

  const { items, totalItems } = await auditLogRepository.findManyPaginated(
    { adminId, type, since: sinceRaw ? new Date(sinceRaw) : undefined },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicEntry),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

/** Backs the "Администратор: все" filter dropdown on the Audit log screen. */
export const listAdmins = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();
  const admins = await platformAdminRepository.findAll();
  sendSuccess(
    res,
    admins.map((a) => ({ id: a._id.toString(), email: a.email, name: a.name })),
  );
});
