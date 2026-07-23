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
): Promise<void> {
  await CompanyModel.updateOne({ _id: companyId }, { $set: { subscriptionPlan: plan, status } }).exec();
}

async function createAdminAndLogin(email: string): Promise<string> {
  const passwordHash = await hashPassword(strongPassword);
  await platformAdminRepository.create({ email, passwordHash, name: 'Test Admin' });
  const login = await request(app).post('/api/v1/admin/auth/login').send({ email, password: strongPassword });
  return login.body.data.accessToken as string;
}

async function inviteEmployee(ownerToken: string, email: string): Promise<void> {
  await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Employee', email, role: 'employee' });
}

describe('GET /api/v1/admin/companies', () => {
  it('requires admin authentication', async () => {
    const res = await request(app).get('/api/v1/admin/companies');
    expect(res.status).toBe(401);
  });

  it('a tenant owner\'s access token is rejected (this is not a tenant-facing endpoint)', async () => {
    const { token } = await registerCompany('owner-ac1@ac.test', 'AC Co 1');
    const res = await request(app).get('/api/v1/admin/companies').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('lists companies with owner email and user/warehouse counts', async () => {
    const { companyId } = await registerCompany('owner-ac2@ac.test', 'AC Co 2');
    const adminToken = await createAdminAndLogin('admin-ac2@axisdigital.test');

    const res = await request(app)
      .get('/api/v1/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const item = res.body.data.items.find((c: { id: string }) => c.id === companyId);
    expect(item).toBeDefined();
    expect(item.ownerEmail).toBe('owner-ac2@ac.test');
    expect(item.usersCount).toBe(1);
    expect(item.warehousesCount).toBe(0);
  });

  it('estimates MRR as 0 for Basic (never actually billed through Stripe)', async () => {
    const { companyId } = await registerCompany('owner-ac3@ac.test', 'AC Co 3');
    const adminToken = await createAdminAndLogin('admin-ac3@axisdigital.test');

    const res = await request(app)
      .get('/api/v1/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`);

    const item = res.body.data.items.find((c: { id: string }) => c.id === companyId);
    expect(item.tariff).toBe('basic');
    expect(item.mrr).toBe(0);
  });

  it('estimates MRR from the plan price for an active paid plan, but 0 if suspended', async () => {
    const { companyId: activeId } = await registerCompany('owner-ac4a@ac.test', 'AC Co 4a');
    await setPlanAndStatus(activeId, SubscriptionPlan.BUSINESS, CompanyStatus.ACTIVE);

    const { companyId: suspendedId } = await registerCompany('owner-ac4b@ac.test', 'AC Co 4b');
    await setPlanAndStatus(suspendedId, SubscriptionPlan.BUSINESS, CompanyStatus.SUSPENDED);

    const adminToken = await createAdminAndLogin('admin-ac4@axisdigital.test');
    const res = await request(app)
      .get('/api/v1/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`);

    const active = res.body.data.items.find((c: { id: string }) => c.id === activeId);
    const suspended = res.body.data.items.find((c: { id: string }) => c.id === suspendedId);
    expect(active.mrr).toBe(79); // PLAN_MONTHLY_PRICE.business = 7900 cents
    expect(suspended.mrr).toBe(0);
  });

  it('filters by tariff', async () => {
    const { companyId } = await registerCompany('owner-ac5@ac.test', 'AC Co 5');
    await setPlanAndStatus(companyId, SubscriptionPlan.ENTERPRISE, CompanyStatus.ACTIVE);
    const adminToken = await createAdminAndLogin('admin-ac5@axisdigital.test');

    const res = await request(app)
      .get('/api/v1/admin/companies?tariff=enterprise')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items.every((c: { tariff: string }) => c.tariff === 'enterprise')).toBe(true);
    expect(res.body.data.items.some((c: { id: string }) => c.id === companyId)).toBe(true);
  });

  it('filters by status', async () => {
    const { companyId } = await registerCompany('owner-ac6@ac.test', 'AC Co 6');
    await setPlanAndStatus(companyId, SubscriptionPlan.BASIC, CompanyStatus.PAST_DUE);
    const adminToken = await createAdminAndLogin('admin-ac6@axisdigital.test');

    const res = await request(app)
      .get('/api/v1/admin/companies?status=past_due')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items.some((c: { id: string }) => c.id === companyId)).toBe(true);
    expect(res.body.data.items.every((c: { status: string }) => c.status === 'past_due')).toBe(true);
  });

  it('searches by company name', async () => {
    await registerCompany('owner-ac7@ac.test', 'Zebra Distribution Norway');
    const adminToken = await createAdminAndLogin('admin-ac7@axisdigital.test');

    const res = await request(app)
      .get('/api/v1/admin/companies?search=zebra')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('Zebra Distribution Norway');
  });

  it('searches by owner email', async () => {
    const { companyId } = await registerCompany('very-unique-owner-ac8@ac.test', 'AC Co 8');
    const adminToken = await createAdminAndLogin('admin-ac8@axisdigital.test');

    const res = await request(app)
      .get('/api/v1/admin/companies?search=very-unique-owner-ac8')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items.some((c: { id: string }) => c.id === companyId)).toBe(true);
  });
});

describe('GET /api/v1/admin/companies/:id', () => {
  it('requires admin authentication', async () => {
    const { companyId } = await registerCompany('owner-ac9@ac.test', 'AC Co 9');
    const res = await request(app).get(`/api/v1/admin/companies/${companyId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent company', async () => {
    const adminToken = await createAdminAndLogin('admin-ac10@axisdigital.test');
    const res = await request(app)
      .get('/api/v1/admin/companies/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed id', async () => {
    const adminToken = await createAdminAndLogin('admin-ac11@axisdigital.test');
    const res = await request(app)
      .get('/api/v1/admin/companies/not-an-object-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns full detail - city, business type, team, and counts', async () => {
    const { token, companyId } = await registerCompany('owner-ac12@ac.test', 'AC Co 12');
    await inviteEmployee(token, 'employee-ac12@ac.test');
    const adminToken = await createAdminAndLogin('admin-ac12@axisdigital.test');

    const res = await request(app)
      .get(`/api/v1/admin/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.city).toBe('Stavanger');
    expect(res.body.data.usersCount).toBe(2);
    expect(res.body.data.team).toHaveLength(2);
    expect(res.body.data.team.some((u: { email: string }) => u.email === 'owner-ac12@ac.test')).toBe(true);
    // Invited-but-not-yet-accepted employee still counts as an active user
    // record, matching the tenant Users tab's own definition of "active".
    expect(res.body.data.team.some((u: { email: string }) => u.email === 'employee-ac12@ac.test')).toBe(true);
  });

  it('reflects real activity - lastActiveAt is set after the owner logs in', async () => {
    const { companyId } = await registerCompany('owner-ac13@ac.test', 'AC Co 13');
    // registerCompany itself creates a session (the register call logs
    // the owner in immediately), so lastActiveAt should already be set.
    const adminToken = await createAdminAndLogin('admin-ac13@axisdigital.test');

    const res = await request(app)
      .get(`/api/v1/admin/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.lastActiveAt).not.toBeNull();
  });

  it('returns an empty invoice list for a company with no Stripe customer yet', async () => {
    const { companyId } = await registerCompany('owner-ac14@ac.test', 'AC Co 14');
    const adminToken = await createAdminAndLogin('admin-ac14@axisdigital.test');

    const res = await request(app)
      .get(`/api/v1/admin/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.invoices).toEqual([]);
  });
});

describe('POST /api/v1/admin/companies/:id/override', () => {
  it('requires admin authentication', async () => {
    const { companyId } = await registerCompany('owner-ov1@ov.test', 'OV Co 1');
    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .send({ tariff: 'enterprise', reason: 'test' });
    expect(res.status).toBe(401);
  });

  it('changes the tariff and records an audit log entry with the reason', async () => {
    const { companyId } = await registerCompany('owner-ov2@ov.test', 'OV Co 2');
    const adminToken = await createAdminAndLogin('admin-ov2@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tariff: 'enterprise', reason: 'Подарили Enterprise по договорённости' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.tariff).toBe('enterprise');

    const auditRes = await request(app)
      .get('/api/v1/admin/audit-log')
      .set('Authorization', `Bearer ${adminToken}`);
    const entry = auditRes.body.data.items.find((e: { companyId: string }) => e.companyId === companyId);
    expect(entry).toBeDefined();
    expect(entry.reason).toBe('Подарили Enterprise по договорённости');
    expect(entry.what).toContain('basic');
    expect(entry.what).toContain('enterprise');
  });

  it('changes the status directly (e.g. to suspended)', async () => {
    const { companyId } = await registerCompany('owner-ov3@ov.test', 'OV Co 3');
    const adminToken = await createAdminAndLogin('admin-ov3@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusAction: 'suspended', reason: 'Нарушение условий использования' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suspended');
  });

  it('changing status to active clears pastDueSince', async () => {
    const { companyId } = await registerCompany('owner-ov4@ov.test', 'OV Co 4');
    await setPlanAndStatus(companyId, SubscriptionPlan.BASIC, CompanyStatus.PAST_DUE);
    const adminToken = await createAdminAndLogin('admin-ov4@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusAction: 'active', reason: 'Оплата подтверждена вручную' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('extend_grace pushes pastDueSince forward by 14 days', async () => {
    const { companyId } = await registerCompany('owner-ov5@ov.test', 'OV Co 5');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await setPlanAndStatus(companyId, SubscriptionPlan.BUSINESS, CompanyStatus.PAST_DUE);
    await CompanyModel.updateOne({ _id: companyId }, { $set: { pastDueSince: twoDaysAgo } }).exec();
    const adminToken = await createAdminAndLogin('admin-ov5@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusAction: 'extend_grace', reason: 'Клиент попросил ещё немного времени' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('past_due'); // unchanged - still past_due, just further out

    const updated = await CompanyModel.findById(companyId).exec();
    const expectedMs = twoDaysAgo.getTime() + 14 * 24 * 60 * 60 * 1000;
    expect(updated?.pastDueSince?.getTime()).toBe(expectedMs);
  });

  it('rejects extend_grace on a company that is not past_due', async () => {
    const { companyId } = await registerCompany('owner-ov6@ov.test', 'OV Co 6'); // stays active
    const adminToken = await createAdminAndLogin('admin-ov6@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusAction: 'extend_grace', reason: 'test' });

    expect(res.status).toBe(400);
  });

  it('requires a reason', async () => {
    const { companyId } = await registerCompany('owner-ov7@ov.test', 'OV Co 7');
    const adminToken = await createAdminAndLogin('admin-ov7@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tariff: 'business' });

    expect(res.status).toBe(422);
  });

  it('rejects a request with neither tariff nor statusAction', async () => {
    const { companyId } = await registerCompany('owner-ov8@ov.test', 'OV Co 8');
    const adminToken = await createAdminAndLogin('admin-ov8@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'test' });

    expect(res.status).toBe(422);
  });

  it('returns 400 when nothing would actually change', async () => {
    const { companyId } = await registerCompany('owner-ov9@ov.test', 'OV Co 9'); // stays Basic/active
    const adminToken = await createAdminAndLogin('admin-ov9@axisdigital.test');

    const res = await request(app)
      .post(`/api/v1/admin/companies/${companyId}/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tariff: 'basic', statusAction: 'active', reason: 'no-op test' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent company', async () => {
    const adminToken = await createAdminAndLogin('admin-ov10@axisdigital.test');
    const res = await request(app)
      .post('/api/v1/admin/companies/507f1f77bcf86cd799439011/override')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tariff: 'business', reason: 'test' });

    expect(res.status).toBe(404);
  });
});
