import type { FilterQuery } from 'mongoose';
import { AuditLogModel, type AuditLogDocument } from './admin-audit-log.model.js';
import type { AuditLogDocumentShape, AuditLogActionType } from './admin-audit-log.types.js';
import type { PaginationParams } from '../../utils/pagination.js';

interface CreateAuditLogEntryInput {
  adminId: string;
  adminEmail: string;
  type: AuditLogActionType;
  what: string;
  companyId?: string;
  companyName?: string;
  reason?: string;
}

interface ListAuditLogFilter {
  adminId?: string;
  type?: AuditLogActionType;
  since?: Date;
}

export const auditLogRepository = {
  async create(input: CreateAuditLogEntryInput): Promise<AuditLogDocument> {
    return AuditLogModel.create({
      adminId: input.adminId,
      adminEmail: input.adminEmail,
      type: input.type,
      what: input.what,
      companyId: input.companyId ?? null,
      companyName: input.companyName ?? null,
      reason: input.reason ?? null,
    });
  },

  async findManyPaginated(
    filter: ListAuditLogFilter,
    pagination: PaginationParams,
  ): Promise<{ items: AuditLogDocument[]; totalItems: number }> {
    const query: FilterQuery<AuditLogDocumentShape> = {};
    if (filter.adminId) query.adminId = filter.adminId;
    if (filter.type) query.type = filter.type;
    if (filter.since) query.createdAt = { $gte: filter.since };

    const skip = (pagination.page - 1) * pagination.perPage;
    const [items, totalItems] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pagination.perPage).exec(),
      AuditLogModel.countDocuments(query).exec(),
    ]);

    return { items, totalItems };
  },
};
