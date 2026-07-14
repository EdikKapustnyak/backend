import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { anthropicClient } from '../src/utils/anthropicClient.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { SubscriptionPlan } from '../src/modules/companies/company.types.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

const FAKE_EVENTS_RESULT = {
  events: [
    {
      name: 'Городской фестиваль еды',
      date: '2026-08-01',
      description: 'Ежегодный фестиваль в центре города',
      relevance: 'Большой приток людей в центр города весь день',
    },
  ],
};

let askClaudeForJsonSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  askClaudeForJsonSpy = vi
    .spyOn(anthropicClient, 'askClaudeForJson')
    .mockResolvedValue(FAKE_EVENTS_RESULT);
});

afterEach(() => {
  askClaudeForJsonSpy.mockRestore();
});

async function registerCompany(
  email: string,
  companyName: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register-company')
    .send({ companyName, ownerName: 'Owner', email, password: strongPassword, city: 'Stavanger', ...extra });
  const token = res.body.data.accessToken as string;

  // local-events is gated behind Business+ (see requireFeature('ai')) -
  // Basic is the default plan every test company starts on, but every
  // test in this file needs the AI feature itself, not the gate around
  // it, so upgrade once here rather than at each of the 6 call sites.
  const companyId = res.body.data.user.companyId as string;
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { subscriptionPlan: SubscriptionPlan.BUSINESS } },
  ).exec();

  return token;
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

describe('GET /api/v1/local-events', () => {
  // There used to be a test here for "city not set -> 400", reached by
  // registering without a city. That path is no longer reachable through
  // the API at all: city is required at registration (auth.schema.ts) and
  // PATCH /companies/me's `city` field is NOT nullable (unlike
  // `businessType`, which is - see company.schema.ts), so once set it can
  // be changed but never cleared. The `if (!company.city)` guard in
  // local-event.service.ts stays as defense-in-depth (e.g. against direct
  // DB writes or a future schema change reintroducing a nullable city),
  // but there's no scenario left in this test suite that can exercise it.

  it('calls the AI on the first request and caches the result', async () => {
    const token = await registerCompany('owner2@le.test', 'LE Co 2', {
      city: 'Stavanger',
      businessType: 'кофейня',
    });

    const res = await request(app)
      .get('/api/v1/local-events')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.fromCache).toBe(false);
    expect(res.body.data.city).toBe('Stavanger');
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.events[0].name).toBe('Городской фестиваль еды');
    expect(askClaudeForJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('serves the second request from cache without calling the AI again', async () => {
    const token = await registerCompany('owner3@le.test', 'LE Co 3', { city: 'Oslo' });

    await request(app).get('/api/v1/local-events').set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .get('/api/v1/local-events')
      .set('Authorization', `Bearer ${token}`);

    expect(second.body.data.fromCache).toBe(true);
    expect(askClaudeForJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache with ?refresh=true', async () => {
    const token = await registerCompany('owner4@le.test', 'LE Co 4', { city: 'Bergen' });

    await request(app).get('/api/v1/local-events').set('Authorization', `Bearer ${token}`);
    const refreshed = await request(app)
      .get('/api/v1/local-events?refresh=true')
      .set('Authorization', `Bearer ${token}`);

    expect(refreshed.body.data.fromCache).toBe(false);
    expect(askClaudeForJsonSpy).toHaveBeenCalledTimes(2);
  });

  it('lets an employee fetch local events too', async () => {
    const ownerToken = await registerCompany('owner5@le.test', 'LE Co 5', { city: 'Trondheim' });
    const employeeToken = await inviteEmployee(ownerToken, 'employee5@le.test');

    const res = await request(app)
      .get('/api/v1/local-events')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('keeps each company on its own cache', async () => {
    const tokenA = await registerCompany('ownerA@le.test', 'LE Co A', { city: 'Stavanger' });
    const tokenB = await registerCompany('ownerB@le.test', 'LE Co B', { city: 'Stavanger' });

    await request(app).get('/api/v1/local-events').set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app)
      .get('/api/v1/local-events')
      .set('Authorization', `Bearer ${tokenB}`);

    // Company B's first request must still call the AI (not reuse A's cache),
    // even though both share the same city.
    expect(resB.body.data.fromCache).toBe(false);
    expect(askClaudeForJsonSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects a Basic-plan company with 403 (local events require Business+)', async () => {
    // Deliberately not using the shared registerCompany() helper above -
    // it always upgrades to Business, but this test needs the untouched
    // default plan to exercise the gate itself.
    const res1 = await request(app).post('/api/v1/auth/register-company').send({
      companyName: 'LE Co Basic',
      ownerName: 'Owner',
      email: 'ownerbasic@le.test',
      password: strongPassword,
      city: 'Stavanger',
    });
    const token = res1.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/local-events')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(askClaudeForJsonSpy).not.toHaveBeenCalled();
  });
});
