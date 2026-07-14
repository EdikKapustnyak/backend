import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

async function registerCompany(
  email: string,
  companyName: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register-company')
    .send({ companyName, ownerName: 'Owner', email, password: strongPassword, city: 'Stavanger', ...extra });
  return res.body.data.accessToken as string;
}

async function inviteEmployee(ownerToken: string, email: string): Promise<string> {
  const invite = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Employee', email, role: 'employee' });

  // Mailer isn't configured in the test environment (see tests/setup.ts),
  // so the invite link comes back in the response instead of being emailed.
  const token = new URL(invite.body.data.inviteLink as string).searchParams.get('token');
  const accept = await request(app)
    .post('/api/v1/auth/accept-invite')
    .send({ token, password: strongPassword });
  return accept.body.data.accessToken as string;
}

describe('GET /api/v1/companies/me', () => {
  it('returns the caller company profile', async () => {
    const ownerToken = await registerCompany('owner1@cm.test', 'CM Co 1', {
      city: 'Stavanger',
      businessType: 'кофейня',
    });

    const res = await request(app)
      .get('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.name).toBe('CM Co 1');
    expect(res.body.data.city).toBe('Stavanger');
    expect(res.body.data.businessType).toBe('кофейня');
  });

  it('defaults businessType to null when not provided at registration (city is always set)', async () => {
    const ownerToken = await registerCompany('owner2@cm.test', 'CM Co 2');

    const res = await request(app)
      .get('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.body.data.city).toBe('Stavanger');
    expect(res.body.data.businessType).toBeNull();
  });

  it('defaults the configurable lookback/cache-TTL fields', async () => {
    const ownerToken = await registerCompany('owner2b@cm.test', 'CM Co 2b');

    const res = await request(app)
      .get('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.body.data.wasteAnalyticsDefaultLookbackDays).toBe(30);
    expect(res.body.data.localEventsCacheTtlDays).toBe(7);
  });
});

describe('PATCH /api/v1/companies/me', () => {
  it('lets an owner update city and businessType', async () => {
    const ownerToken = await registerCompany('owner3@cm.test', 'CM Co 3');

    const res = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ city: 'Oslo', businessType: 'ресторан' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.city).toBe('Oslo');
    expect(res.body.data.businessType).toBe('ресторан');
  });

  it('lets an owner update the waste-analytics lookback and local-events cache TTL', async () => {
    const ownerToken = await registerCompany('owner3b@cm.test', 'CM Co 3b');

    const res = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ wasteAnalyticsDefaultLookbackDays: 60, localEventsCacheTtlDays: 3 });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.wasteAnalyticsDefaultLookbackDays).toBe(60);
    expect(res.body.data.localEventsCacheTtlDays).toBe(3);
  });

  it('rejects an out-of-range lookback/cache-TTL value', async () => {
    const ownerToken = await registerCompany('owner3c@cm.test', 'CM Co 3c');

    const tooLong = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ wasteAnalyticsDefaultLookbackDays: 400 });
    expect(tooLong.status).toBe(422);

    const tooLongCache = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ localEventsCacheTtlDays: 45 });
    expect(tooLongCache.status).toBe(422);
  });

  it('rejects an update from an employee (RBAC)', async () => {
    const ownerToken = await registerCompany('owner4@cm.test', 'CM Co 4');
    const employeeToken = await inviteEmployee(ownerToken, 'employee4@cm.test');

    const res = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ city: 'Bergen' });

    expect(res.status).toBe(403);
  });

  it('rejects an empty update body', async () => {
    const ownerToken = await registerCompany('owner5@cm.test', 'CM Co 5');

    const res = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(422);
  });
});
