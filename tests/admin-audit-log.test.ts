import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { platformAdminRepository } from '../src/modules/platform-admin/admin.repository.js';
import { hashPassword } from '../src/utils/password.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

async function registerCompany(email: string, companyName: string): Promise<{ token: string; companyId: string }> {
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

async function createAdminAndLogin(email: string): Promise<string> {
  const passwordHash = await hashPassword(strongPassword);
  await platformAdminRepository.create({ email, passwordHash, name: 'Test Admin' });
  const login = await request(app).post('/api/v1/admin/auth/login').send({ email, password: strongPassword });
  return login.body.data.accessToken as string;
}

async function performOverride(adminToken: string, companyId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/v1/admin/companies/${companyId}/override`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
}

describe('GET /api/v1/admin/audit-log', () => {
  it('requires admin authentication', async () => {
    const res = await request(app).get('/api/v1/admin/audit-log');
    expect(res.status).toBe(401);
  });

  it('a tenant owner\'s access token is rejected', async () => {
    const { token } = await registerCompany('owner-al1@al.test', 'AL Co 1');
    const res = await request(app).get('/api/v1/admin/audit-log').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('lists an override action with the admin, company, and reason attached', async () => {
    const { companyId } = await registerCompany('owner-al2@al.test', 'AL Co 2');
    const adminToken = await createAdminAndLogin('admin-al2@axisdigital.test');
    await performOverride(adminToken, companyId, { tariff: 'enterprise', reason: 'Тестовая причина' });

    const res = await request(app).get('/api/v1/admin/audit-log').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const entry = res.body.data.items.find((e: { companyId: string }) => e.companyId === companyId);
    expect(entry).toBeDefined();
    expect(entry.adminEmail).toBe('admin-al2@axisdigital.test');
    expect(entry.type).toBe('override');
    expect(entry.companyName).toBe('AL Co 2');
    expect(entry.reason).toBe('Тестовая причина');
  });

  it('filters by action type', async () => {
    const { companyId } = await registerCompany('owner-al3@al.test', 'AL Co 3');
    const adminToken = await createAdminAndLogin('admin-al3@axisdigital.test');
    await performOverride(adminToken, companyId, { tariff: 'business', reason: 'test' });

    const res = await request(app)
      .get('/api/v1/admin/audit-log?type=override')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items.every((e: { type: string }) => e.type === 'override')).toBe(true);
  });

  it('filters by adminId - one admin\'s override does not show up under another admin\'s filter', async () => {
    const { companyId: companyA } = await registerCompany('owner-al4a@al.test', 'AL Co 4a');
    const { companyId: companyB } = await registerCompany('owner-al4b@al.test', 'AL Co 4b');
    const adminTokenA = await createAdminAndLogin('admin-al4a@axisdigital.test');
    const adminTokenB = await createAdminAndLogin('admin-al4b@axisdigital.test');

    await performOverride(adminTokenA, companyA, { tariff: 'business', reason: 'by admin A' });
    await performOverride(adminTokenB, companyB, { tariff: 'business', reason: 'by admin B' });

    const adminsRes = await request(app)
      .get('/api/v1/admin/audit-log/admins')
      .set('Authorization', `Bearer ${adminTokenA}`);
    const adminA = adminsRes.body.data.find((a: { email: string }) => a.email === 'admin-al4a@axisdigital.test');
    expect(adminA).toBeDefined();

    const res = await request(app)
      .get(`/api/v1/admin/audit-log?adminId=${adminA.id}`)
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.body.data.items.every((e: { adminEmail: string }) => e.adminEmail === 'admin-al4a@axisdigital.test')).toBe(true);
    expect(res.body.data.items.some((e: { reason: string }) => e.reason === 'by admin B')).toBe(false);
  });

  it('newest entries come first', async () => {
    const { companyId: companyA } = await registerCompany('owner-al5a@al.test', 'AL Co 5a');
    const { companyId: companyB } = await registerCompany('owner-al5b@al.test', 'AL Co 5b');
    const adminToken = await createAdminAndLogin('admin-al5@axisdigital.test');

    await performOverride(adminToken, companyA, { tariff: 'business', reason: 'first' });
    await performOverride(adminToken, companyB, { tariff: 'business', reason: 'second' });

    const res = await request(app).get('/api/v1/admin/audit-log').set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items[0].reason).toBe('second');
  });
});

describe('GET /api/v1/admin/audit-log/admins', () => {
  it('requires admin authentication', async () => {
    const res = await request(app).get('/api/v1/admin/audit-log/admins');
    expect(res.status).toBe(401);
  });

  it('lists provisioned platform admins', async () => {
    const adminToken = await createAdminAndLogin('admin-al6@axisdigital.test');
    const res = await request(app)
      .get('/api/v1/admin/audit-log/admins')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { email: string }) => a.email === 'admin-al6@axisdigital.test')).toBe(true);
  });
});
