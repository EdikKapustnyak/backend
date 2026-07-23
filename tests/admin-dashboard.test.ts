import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { SubscriptionPlan, CompanyStatus } from '../src/modules/companies/company.types.js';
import { platformAdminRepository } from '../src/modules/platform-admin/admin.repository.js';
import { hashPassword } from '../src/utils/password.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface Company {
  token: string;
  companyId: string;
}

async function registerCompany(email: string, companyName: string): Promise<Company> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    city: 'Stavanger',
    ownerName: 'Owner',
    email,
    password: strongPassword,
  });
  return {
    token: res.body.data.accessToken as string,
    companyId: res.body.data.user.companyId as string,
  };
}

async function setPlanAndStatus(
  companyId: string,
  plan: SubscriptionPlan,
  status: CompanyStatus,
  pastDueSince?: Date,
): Promise<void> {
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { subscriptionPlan: plan, status, ...(pastDueSince ? { pastDueSince } : {}) } },
  ).exec();
}

async function createAdminAndLogin(email: string): Promise<string> {
  const passwordHash = await hashPassword(strongPassword);
  await platformAdminRepository.create({ email, passwordHash, name: 'Test Admin' });
  const login = await request(app).post('/api/v1/admin/auth/login').send({ email, password: strongPassword });
  return login.body.data.accessToken as string;
}

async function submitLead(name: string, company?: string): Promise<void> {
  await request(app)
    .post('/api/v1/contact')
    .send({
      name,
      company,
      channel: 'email',
      contact: `${name.toLowerCase().replace(/\s+/g, '')}@lead.test`,
      message: 'Interested in Business plan',
    });
}

describe('GET /api/v1/admin/dashboard', () => {
  it('requires admin authentication', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('a tenant owner\'s access token is rejected', async () => {
    const { token } = await registerCompany('owner-ad1@ad.test', 'AD Co 1');
    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('counts companies by tariff and totals MRR correctly', async () => {
    await registerCompany('owner-ad2a@ad.test', 'AD Co 2a'); // stays Basic (the default) - contributes 0 to MRR

    const { companyId: businessId } = await registerCompany('owner-ad2b@ad.test', 'AD Co 2b');
    await setPlanAndStatus(businessId, SubscriptionPlan.BUSINESS, CompanyStatus.ACTIVE);

    const { companyId: enterpriseId } = await registerCompany('owner-ad2c@ad.test', 'AD Co 2c');
    await setPlanAndStatus(enterpriseId, SubscriptionPlan.ENTERPRISE, CompanyStatus.ACTIVE);

    const adminToken = await createAdminAndLogin('admin-ad2@axisdigital.test');
    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.companiesByTariff.basic).toBeGreaterThanOrEqual(1);
    expect(res.body.data.companiesByTariff.business).toBeGreaterThanOrEqual(1);
    expect(res.body.data.companiesByTariff.enterprise).toBeGreaterThanOrEqual(1);
    // PLAN_MONTHLY_PRICE: business=7900, enterprise=19900 cents -> 79 + 199
    expect(res.body.data.totalMrr).toBeGreaterThanOrEqual(278);
  });

  it('counts active users within the 7-day window (registering logs the owner in, so they count)', async () => {
    await registerCompany('owner-ad3@ad.test', 'AD Co 3');
    const adminToken = await createAdminAndLogin('admin-ad3@axisdigital.test');

    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.activeUsers.count).toBeGreaterThanOrEqual(1);
    expect(res.body.data.activeUsers.totalUsers).toBeGreaterThanOrEqual(res.body.data.activeUsers.count);
    expect(res.body.data.activeUsers.windowDays).toBe(7);
  });

  it('counts new leads in the last 7 days and how many are still open', async () => {
    await submitLead('Lead One');
    await submitLead('Lead Two');
    const adminToken = await createAdminAndLogin('admin-ad4@axisdigital.test');

    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.newLeads.count).toBeGreaterThanOrEqual(2);
    expect(res.body.data.newLeads.openCount).toBeGreaterThanOrEqual(2); // both still "new"
    expect(res.body.data.newLeads.windowDays).toBe(7);
  });

  it('lists companies needing attention with a countdown hint for past_due', async () => {
    const { companyId } = await registerCompany('owner-ad5@ad.test', 'AD Co 5');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await setPlanAndStatus(companyId, SubscriptionPlan.BUSINESS, CompanyStatus.PAST_DUE, twoDaysAgo);

    const adminToken = await createAdminAndLogin('admin-ad5@axisdigital.test');
    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    const entry = res.body.data.needsAttention.find((c: { id: string }) => c.id === companyId);
    expect(entry).toBeDefined();
    // GRACE_PERIOD_DAYS=7, 2 days since past_due -> 5 days left
    expect(entry.hint).toBe('5 дн. до приостановки');
  });

  it('shows suspended companies with a non-countdown hint', async () => {
    const { companyId } = await registerCompany('owner-ad6@ad.test', 'AD Co 6');
    await setPlanAndStatus(companyId, SubscriptionPlan.BASIC, CompanyStatus.SUSPENDED);

    const adminToken = await createAdminAndLogin('admin-ad6@axisdigital.test');
    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    const entry = res.body.data.needsAttention.find((c: { id: string }) => c.id === companyId);
    expect(entry.hint).toBe('приостановлена');
  });

  it('excludes active companies from the needs-attention list', async () => {
    const { companyId } = await registerCompany('owner-ad7@ad.test', 'AD Co 7');
    const adminToken = await createAdminAndLogin('admin-ad7@axisdigital.test');

    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.needsAttention.some((c: { id: string }) => c.id === companyId)).toBe(false);
  });

  it('returns the most recent leads, newest first', async () => {
    await submitLead('Older Lead');
    await submitLead('Newer Lead');
    const adminToken = await createAdminAndLogin('admin-ad8@axisdigital.test');

    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.recentLeads.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.recentLeads[0].name).toBe('Newer Lead');
  });

  it('reports a real database ping, not a hardcoded value', async () => {
    const adminToken = await createAdminAndLogin('admin-ad9@axisdigital.test');
    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.health.database.ok).toBe(true);
    expect(typeof res.body.data.health.database.latencyMs).toBe('number');
  });

  it('reports Stripe/email as unconfigured in the test environment (both are blanked out in tests/setup.ts)', async () => {
    const adminToken = await createAdminAndLogin('admin-ad10@axisdigital.test');
    const res = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.health.stripe.configured).toBe(false);
    expect(res.body.data.health.email.configured).toBe(false);
  });
});
