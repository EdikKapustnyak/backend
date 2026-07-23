import type { SubscriptionPlan, CompanyStatus } from '../companies/company.types.js';
import type { Role } from '../users/user.types.js';

export interface AdminCompanyListItem {
  id: string;
  name: string;
  ownerEmail: string | null;
  tariff: SubscriptionPlan;
  status: CompanyStatus;
  usersCount: number;
  warehousesCount: number;
  registeredAt: string;
  /** In whole currency units (dollars), not cents - 0 for Basic (never actually billed via Stripe) and for suspended companies. Approximated from plan.config.ts's PLAN_MONTHLY_PRICE for this list view; the dedicated Revenue screen (not built yet) is the source of truth verified against Stripe itself. */
  mrr: number;
}

export interface AdminCompanyTeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AdminCompanyInvoice {
  id: string;
  periodStart: string;
  periodEnd: string;
  /** In whole currency units (dollars), not cents. */
  amount: number;
  status: string;
}

export interface AdminCompanyDetail extends AdminCompanyListItem {
  city: string;
  businessType: string | null;
  productsCount: number;
  lastActiveAt: string | null;
  team: AdminCompanyTeamMember[];
  invoices: AdminCompanyInvoice[];
}
