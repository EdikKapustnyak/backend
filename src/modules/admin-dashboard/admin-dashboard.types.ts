import type { SubscriptionPlan, CompanyStatus } from '../companies/company.types.js';

export interface CompaniesByTariff {
  basic: number;
  business: number;
  enterprise: number;
}

export interface AttentionCompany {
  id: string;
  name: string;
  tariff: SubscriptionPlan;
  status: CompanyStatus;
  /** Human-readable, e.g. "3 дн. до приостановки" for past_due, or "приостановлена" for suspended - see admin-dashboard.service.ts#buildAttentionHint. */
  hint: string;
}

export interface RecentLead {
  id: string;
  name: string;
  company: string | null;
  status: 'new' | 'progress' | 'done';
  createdAt: string;
}

export interface AdminDashboardSummary {
  totalCompanies: number;
  companiesByTariff: CompaniesByTariff;
  /** Current snapshot only, not a live Stripe read (same estimate as the Companies list) - see estimateMrr's doc comment in admin-company.repository.ts. No historical trend is shown: there's no MRR-over-time tracking in this codebase yet, and a fabricated trend line would be worse than none. */
  totalMrr: number;
  activeUsers: {
    count: number;
    totalUsers: number;
    windowDays: number;
  };
  newLeads: {
    count: number;
    openCount: number;
    windowDays: number;
  };
  needsAttention: AttentionCompany[];
  recentLeads: RecentLead[];
  health: {
    database: { ok: boolean; latencyMs: number };
    stripe: { configured: boolean };
    email: { configured: boolean };
  };
}
