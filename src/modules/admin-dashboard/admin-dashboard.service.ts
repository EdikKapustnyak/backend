import mongoose from 'mongoose';
import { CompanyModel } from '../companies/company.model.js';
import { CompanyStatus } from '../companies/company.types.js';
import { UserModel } from '../users/user.model.js';
import { SessionModel } from '../auth/session.model.js';
import { ContactSubmissionModel } from '../contact-submissions/contact-submission.model.js';
import { adminCompanyRepository } from '../admin-companies/admin-company.repository.js';
import { GRACE_PERIOD_DAYS } from '../billing/plan.config.js';
import { stripeClient } from '../../utils/stripeClient.js';
import { env } from '../../config/env.js';
import type { AdminDashboardSummary, AttentionCompany, RecentLead } from './admin-dashboard.types.js';

const ACTIVE_USERS_WINDOW_DAYS = 7;
const NEW_LEADS_WINDOW_DAYS = 7;
const NEEDS_ATTENTION_LIMIT = 10;
const RECENT_LEADS_LIMIT = 3;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * past_due shows a countdown to when the lazy grace-period escalation
 * (billing.service.ts) will flip it to suspended - matching the design's
 * "{{ c.hint }}" column. suspended has no countdown left to show.
 */
function buildAttentionHint(status: CompanyStatus, pastDueSince: Date | null): string {
  if (status === CompanyStatus.SUSPENDED) return 'приостановлена';
  if (status === CompanyStatus.PAST_DUE && pastDueSince) {
    const daysSince = Math.floor((Date.now() - pastDueSince.getTime()) / (24 * 60 * 60 * 1000));
    const daysLeft = Math.max(0, GRACE_PERIOD_DAYS - daysSince);
    return `${daysLeft} дн. до приостановки`;
  }
  return '';
}

async function getCompaniesByTariffAndMrr(): Promise<{
  totalCompanies: number;
  companiesByTariff: { basic: number; business: number; enterprise: number };
  totalMrr: number;
}> {
  // Company has no tenantScopePlugin (it IS the tenant, not a child of
  // one) - reading across every company needs no skipTenantScope at all,
  // same as adminCompanyRepository.listCompanies.
  const companies = await CompanyModel.find({}).select('subscriptionPlan status').exec();

  const companiesByTariff = { basic: 0, business: 0, enterprise: 0 };
  let totalMrr = 0;
  for (const company of companies) {
    companiesByTariff[company.subscriptionPlan] += 1;
    totalMrr += adminCompanyRepository.estimateMrr(company.subscriptionPlan, company.status);
  }

  return { totalCompanies: companies.length, companiesByTariff, totalMrr };
}

async function getActiveUsers(): Promise<{ count: number; totalUsers: number; windowDays: number }> {
  const cutoff = daysAgo(ACTIVE_USERS_WINDOW_DAYS);
  // Cross-tenant by design (a platform-wide count) - both queries need
  // skipTenantScope since neither filters by a single companyId.
  const recentUserIds = await SessionModel.distinct('userId', { lastUsedAt: { $gte: cutoff } });
  const [count, totalUsers] = await Promise.all([
    UserModel.countDocuments({ _id: { $in: recentUserIds }, isActive: true })
      .setOptions({ skipTenantScope: true })
      .exec(),
    UserModel.countDocuments({ isActive: true }).setOptions({ skipTenantScope: true }).exec(),
  ]);
  return { count, totalUsers, windowDays: ACTIVE_USERS_WINDOW_DAYS };
}

async function getNewLeads(): Promise<{ count: number; openCount: number; windowDays: number }> {
  const cutoff = daysAgo(NEW_LEADS_WINDOW_DAYS);
  const [count, openCount] = await Promise.all([
    ContactSubmissionModel.countDocuments({ createdAt: { $gte: cutoff } }).exec(),
    ContactSubmissionModel.countDocuments({ createdAt: { $gte: cutoff }, status: { $ne: 'done' } }).exec(),
  ]);
  return { count, openCount, windowDays: NEW_LEADS_WINDOW_DAYS };
}

async function getNeedsAttention(): Promise<AttentionCompany[]> {
  const companies = await CompanyModel.find({
    status: { $in: [CompanyStatus.PAST_DUE, CompanyStatus.SUSPENDED] },
  })
    .sort({ pastDueSince: 1 }) // longest-overdue first
    .limit(NEEDS_ATTENTION_LIMIT)
    .exec();

  return companies.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    tariff: c.subscriptionPlan,
    status: c.status,
    hint: buildAttentionHint(c.status, c.pastDueSince),
  }));
}

async function getRecentLeads(): Promise<RecentLead[]> {
  const leads = await ContactSubmissionModel.find({})
    .sort({ createdAt: -1 })
    .limit(RECENT_LEADS_LIMIT)
    .exec();

  return leads.map((l) => ({
    id: l._id.toString(),
    name: l.name,
    company: l.company,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  }));
}

/** A real ping, not a fabricated "ok" - times a trivial query against the actual connected database. */
async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await mongoose.connection.db?.admin().ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export async function getDashboardSummary(): Promise<AdminDashboardSummary> {
  const [companiesSummary, activeUsers, newLeads, needsAttention, recentLeads, database] = await Promise.all([
    getCompaniesByTariffAndMrr(),
    getActiveUsers(),
    getNewLeads(),
    getNeedsAttention(),
    getRecentLeads(),
    checkDatabaseHealth(),
  ]);

  return {
    totalCompanies: companiesSummary.totalCompanies,
    companiesByTariff: companiesSummary.companiesByTariff,
    totalMrr: companiesSummary.totalMrr,
    activeUsers,
    newLeads,
    needsAttention,
    recentLeads,
    health: {
      database,
      stripe: { configured: stripeClient.isConfigured() },
      email: { configured: Boolean(env.RESEND_API_KEY && env.MAIL_FROM) },
    },
  };
}
