import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { NotFoundError, UnauthorizedError } from '../../errors/index.js';
import { adminCompanyRepository } from './admin-company.repository.js';
import { platformAdminRepository } from '../platform-admin/admin.repository.js';
import { stripeClient } from '../../utils/stripeClient.js';
import type { CompanyDocument } from '../companies/company.model.js';
import type { SubscriptionPlan, CompanyStatus } from '../companies/company.types.js';
import type { AdminCompanyDetail, AdminCompanyInvoice, AdminCompanyListItem } from './admin-company.types.js';

function toListItem(
  company: CompanyDocument,
  ownerEmail: string | null,
  usersCount: number,
  warehousesCount: number,
): AdminCompanyListItem {
  return {
    id: company._id.toString(),
    name: company.name,
    ownerEmail,
    tariff: company.subscriptionPlan,
    status: company.status,
    usersCount,
    warehousesCount,
    registeredAt: company.createdAt.toISOString(),
    mrr: adminCompanyRepository.estimateMrr(company.subscriptionPlan, company.status),
  };
}

export const listAdminCompanies = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const search = req.query['search'] as string | undefined;
  const tariff = req.query['tariff'] as SubscriptionPlan | undefined;
  const status = req.query['status'] as CompanyStatus | undefined;
  const registeredAfterRaw = req.query['registeredAfter'] as string | undefined;

  const { items, totalItems } = await adminCompanyRepository.listCompanies(
    {
      search,
      tariff,
      status,
      registeredAfter: registeredAfterRaw ? new Date(registeredAfterRaw) : undefined,
    },
    pagination,
  );

  sendSuccess(res, {
    items: items.map((e) => toListItem(e.company, e.ownerEmail, e.usersCount, e.warehousesCount)),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

/**
 * Invoices come straight from Stripe (no local copy) - matches the
 * functional spec's Revenue-screen guidance not to duplicate what Stripe
 * already has a source of truth for. Silently returns an empty list
 * rather than erroring the whole detail page if Stripe isn't configured
 * or the call itself fails - a company's team/counts are still useful to
 * see even without its billing history.
 */
async function fetchInvoices(stripeCustomerId: string | null): Promise<AdminCompanyInvoice[]> {
  if (!stripeCustomerId || !stripeClient.isConfigured()) return [];

  try {
    const stripe = stripeClient.getClient();
    const result = await stripe.invoices.list({ customer: stripeCustomerId, limit: 12 });
    return result.data.map((invoice) => ({
      id: invoice.number ?? invoice.id ?? 'unknown',
      periodStart: new Date(invoice.period_start * 1000).toISOString(),
      periodEnd: new Date(invoice.period_end * 1000).toISOString(),
      amount: (invoice.amount_paid || invoice.total) / 100,
      status: invoice.status ?? 'unknown',
    }));
  } catch {
    return [];
  }
}

export const getAdminCompanyDetail = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const id = req.params['id'] as string;
  const company = await adminCompanyRepository.findCompanyById(id);
  if (!company) throw new NotFoundError('Company not found');

  const team = await adminCompanyRepository.getTeam(company._id);
  const owner = team.find((u) => u.role === 'owner') ?? null;

  const [productsCount, lastActiveAt, invoices] = await Promise.all([
    adminCompanyRepository.getProductsCount(company._id),
    adminCompanyRepository.getLastActiveAt(team.map((u) => u._id)),
    fetchInvoices(company.stripeCustomerId),
  ]);

  const usersCount = team.length;
  const warehousesCount = await adminCompanyRepository.getWarehousesCount(company._id);

  const detail: AdminCompanyDetail = {
    ...toListItem(company, owner?.email ?? null, usersCount, warehousesCount),
    city: company.city,
    businessType: company.businessType,
    productsCount,
    lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    team: team.map((u) => ({ id: u._id.toString(), name: u.name, email: u.email, role: u.role })),
    invoices,
  };

  sendSuccess(res, detail);
});

export const overrideAdminCompany = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const admin = await platformAdminRepository.findById(req.adminAuth.adminId);
  if (!admin) throw new UnauthorizedError();

  const id = req.params['id'] as string;
  await adminCompanyRepository.applyOverride(id, req.body, {
    adminId: req.adminAuth.adminId,
    adminEmail: admin.email,
  });

  // Re-fetch the full detail (team/counts/invoices) rather than hand-
  // assembling it from the override result - same response shape as
  // GET /admin/companies/:id, so the frontend can just refresh in place.
  const company = await adminCompanyRepository.findCompanyById(id);
  if (!company) throw new NotFoundError('Company not found');

  const team = await adminCompanyRepository.getTeam(company._id);
  const owner = team.find((u) => u.role === 'owner') ?? null;
  const [productsCount, lastActiveAt, invoices, warehousesCount] = await Promise.all([
    adminCompanyRepository.getProductsCount(company._id),
    adminCompanyRepository.getLastActiveAt(team.map((u) => u._id)),
    fetchInvoices(company.stripeCustomerId),
    adminCompanyRepository.getWarehousesCount(company._id),
  ]);

  const detail: AdminCompanyDetail = {
    ...toListItem(company, owner?.email ?? null, team.length, warehousesCount),
    city: company.city,
    businessType: company.businessType,
    productsCount,
    lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    team: team.map((u) => ({ id: u._id.toString(), name: u.name, email: u.email, role: u.role })),
    invoices,
  };

  sendSuccess(res, detail, 'Company updated');
});
