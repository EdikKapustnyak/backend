import type { FilterQuery, Types } from 'mongoose';
import { CompanyModel } from '../companies/company.model.js';
import type { CompanyDocument } from '../companies/company.model.js';
import { SubscriptionPlan, CompanyStatus, type CompanyDocumentShape } from '../companies/company.types.js';
import { UserModel } from '../users/user.model.js';
import { Role } from '../users/user.types.js';
import { WarehouseModel } from '../warehouses/warehouse.model.js';
import { ProductModel } from '../products/product.model.js';
import { SessionModel } from '../auth/session.model.js';
import { PLAN_MONTHLY_PRICE } from '../billing/plan.config.js';
import { auditLogRepository } from '../admin-audit-log/admin-audit-log.repository.js';
import { AuditLogActionType } from '../admin-audit-log/admin-audit-log.types.js';
import { BadRequestError, NotFoundError } from '../../errors/index.js';
import type { PaginationParams } from '../../utils/pagination.js';
import type { OverrideCompanyInput } from './admin-company.schema.js';

interface ListCompaniesFilter {
  search?: string;
  tariff?: SubscriptionPlan;
  status?: CompanyStatus;
  registeredAfter?: Date;
}

interface EnrichedCompany {
  company: CompanyDocument;
  ownerEmail: string | null;
  usersCount: number;
  warehousesCount: number;
}

/** 0 for Basic (never actually billed through Stripe - see plan.config.ts) and for suspended companies (not counted as live revenue). Approximated from the plan's list price, not a live Stripe read - see AdminCompanyListItem's doc comment for why. */
function estimateMrr(plan: SubscriptionPlan, status: CompanyStatus): number {
  if (plan === SubscriptionPlan.BASIC || status === CompanyStatus.SUSPENDED) return 0;
  return PLAN_MONTHLY_PRICE[plan] / 100;
}

async function enrichCompany(company: CompanyDocument): Promise<EnrichedCompany> {
  const [owner, usersCount, warehousesCount] = await Promise.all([
    UserModel.findOne({ companyId: company._id, role: Role.OWNER }).exec(),
    UserModel.countDocuments({ companyId: company._id, isActive: true }).exec(),
    WarehouseModel.countDocuments({ companyId: company._id, isActive: true }).exec(),
  ]);
  return { company, ownerEmail: owner?.email ?? null, usersCount, warehousesCount };
}

export const adminCompanyRepository = {
  /**
   * Cross-tenant by design (this is the whole point of the admin
   * Companies screen) - Company itself has no tenantScopePlugin (it IS
   * the tenant, not a child of one), so listing every company needs no
   * skipTenantScope at all. The per-company enrichment queries below
   * (owner/counts) DO have the plugin, but each one's filter includes its
   * own companyId, so no skipTenantScope is needed there either - this
   * deliberately avoids a cross-company aggregate pipeline (and the
   * skipTenantScope escape hatch that would require) in favor of N
   * bounded-to-page-size queries, N being at most `perPage`.
   */
  async listCompanies(
    filter: ListCompaniesFilter,
    pagination: PaginationParams,
  ): Promise<{ items: EnrichedCompany[]; totalItems: number }> {
    const query: FilterQuery<CompanyDocumentShape> = {};

    if (filter.tariff) query.subscriptionPlan = filter.tariff;
    if (filter.status) query.status = filter.status;
    if (filter.registeredAfter) query.createdAt = { $gte: filter.registeredAfter };

    if (filter.search) {
      const pattern = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matchingOwners = await UserModel.find({ role: Role.OWNER, email: pattern })
        .select('companyId')
        .setOptions({ skipTenantScope: true })
        .exec();
      const ownerCompanyIds = matchingOwners.map((u) => u.companyId);
      query.$or = [{ name: pattern }, ...(ownerCompanyIds.length ? [{ _id: { $in: ownerCompanyIds } }] : [])];
    }

    const skip = (pagination.page - 1) * pagination.perPage;
    const [companies, totalItems] = await Promise.all([
      CompanyModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(pagination.perPage).exec(),
      CompanyModel.countDocuments(query).exec(),
    ]);

    const items = await Promise.all(companies.map(enrichCompany));
    return { items, totalItems };
  },

  estimateMrr,

  async findCompanyById(id: string): Promise<CompanyDocument | null> {
    return CompanyModel.findById(id).exec();
  },

  async getTeam(companyId: Types.ObjectId | string) {
    return UserModel.find({ companyId, isActive: true })
      .sort({ role: 1, name: 1 })
      .exec();
  },

  async getProductsCount(companyId: Types.ObjectId | string): Promise<number> {
    return ProductModel.countDocuments({ companyId, isActive: true }).exec();
  },

  async getWarehousesCount(companyId: Types.ObjectId | string): Promise<number> {
    return WarehouseModel.countDocuments({ companyId, isActive: true }).exec();
  },

  async getUsersCount(companyId: Types.ObjectId | string): Promise<number> {
    return UserModel.countDocuments({ companyId, isActive: true }).exec();
  },

  async getOwnerEmail(companyId: Types.ObjectId | string): Promise<string | null> {
    const owner = await UserModel.findOne({ companyId, role: Role.OWNER }).exec();
    return owner?.email ?? null;
  },

  /** Most recent Session.lastUsedAt across every user in the company - Session has no companyId field of its own (only userId), so this needs the company's user ids first. Not tenant-scoped at all (Session predates/doesn't use the plugin), just a plain userId-in query. */
  async getLastActiveAt(userIds: Types.ObjectId[]): Promise<Date | null> {
    if (userIds.length === 0) return null;
    const session = await SessionModel.findOne({ userId: { $in: userIds } })
      .sort({ lastUsedAt: -1 })
      .exec();
    return session?.lastUsedAt ?? null;
  },

  /**
   * Both tariff and statusAction are optional independently (the modal's
   * two selects submit together) - at least one is guaranteed present by
   * overrideCompanySchema's .refine(). "extend_grace" is its own branch
   * rather than resubmitting status:'past_due' again, because the point
   * of it is to push `pastDueSince` forward - re-setting status to the
   * value it already is wouldn't do that. Every actual change is recorded
   * in the audit log with the caller-supplied reason - see the design's
   * Override modal, which makes the reason field mandatory for exactly
   * this purpose.
   */
  async applyOverride(
    companyId: string,
    input: OverrideCompanyInput,
    admin: { adminId: string; adminEmail: string },
  ): Promise<CompanyDocument> {
    const company = await CompanyModel.findById(companyId).exec();
    if (!company) throw new NotFoundError('Company not found');

    const changes: string[] = [];

    if (input.tariff && input.tariff !== company.subscriptionPlan) {
      changes.push(`Тариф: ${company.subscriptionPlan} → ${input.tariff}`);
      company.subscriptionPlan = input.tariff;
    }

    if (input.statusAction === 'extend_grace') {
      if (company.status !== CompanyStatus.PAST_DUE) {
        throw new BadRequestError('extend_grace only applies to a company that is currently past_due');
      }
      const base = company.pastDueSince ?? new Date();
      company.pastDueSince = new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
      changes.push('Grace period продлён на 14 дней');
    } else if (input.statusAction && input.statusAction !== company.status) {
      const newStatus = input.statusAction as CompanyStatus;
      changes.push(`Статус: ${company.status} → ${newStatus}`);
      company.status = newStatus;
      if (newStatus === CompanyStatus.ACTIVE) {
        company.pastDueSince = null;
      } else if (newStatus === CompanyStatus.PAST_DUE && !company.pastDueSince) {
        company.pastDueSince = new Date();
      }
    }

    if (changes.length === 0) {
      throw new BadRequestError('No changes to apply - tariff and status already match the request');
    }

    await company.save();

    await auditLogRepository.create({
      adminId: admin.adminId,
      adminEmail: admin.adminEmail,
      type: AuditLogActionType.OVERRIDE,
      what: changes.join('; '),
      companyId: company._id.toString(),
      companyName: company.name,
      reason: input.reason,
    });

    return company;
  },
};
