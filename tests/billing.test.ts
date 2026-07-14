import { describe, it, expect, vi, afterEach } from 'vitest';
import type Stripe from 'stripe';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { stripeClient } from '../src/utils/stripeClient.js';
import { billingService } from '../src/modules/billing/billing.service.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { CompanyStatus, SubscriptionPlan } from '../src/modules/companies/company.types.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface RegisteredCompany {
  token: string;
  companyId: string;
}

async function registerCompany(email: string, companyName: string): Promise<RegisteredCompany> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    ownerName: 'Owner',
    email,
    password: strongPassword,
    city: 'Stavanger',
  });
  return {
    token: res.body.data.accessToken as string,
    companyId: res.body.data.user.companyId as string,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/billing/checkout', () => {
  it('creates a Stripe customer + checkout session and persists the customer id', async () => {
    const { token, companyId } = await registerCompany('owner1@bill.test', 'Bill Co 1');

    const createCustomer = vi.fn().mockResolvedValue({ id: 'cus_fake1' });
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/fake1' });
    vi.spyOn(stripeClient, 'getClient').mockReturnValue({
      customers: { create: createCustomer },
      checkout: { sessions: { create: createSession } },
    } as unknown as Stripe);

    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'business', period: 3 });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.checkoutUrl).toBe('https://checkout.stripe.com/fake1');
    expect(createCustomer).toHaveBeenCalledOnce();
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_fake1', client_reference_id: companyId }),
    );

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.stripeCustomerId).toBe('cus_fake1');
  });

  it('reuses an existing Stripe customer instead of creating a new one', async () => {
    const { token, companyId } = await registerCompany('owner2@bill.test', 'Bill Co 2');
    await CompanyModel.updateOne({ _id: companyId }, { $set: { stripeCustomerId: 'cus_existing' } }).exec();

    const createCustomer = vi.fn();
    const createSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/fake2' });
    vi.spyOn(stripeClient, 'getClient').mockReturnValue({
      customers: { create: createCustomer },
      checkout: { sessions: { create: createSession } },
    } as unknown as Stripe);

    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'enterprise', period: 12 });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' }),
    );
  });

  it('rejects Basic in the request body - it is not sold through checkout', async () => {
    const { token } = await registerCompany('owner3@bill.test', 'Bill Co 3');

    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'basic', period: 1 });

    expect(res.status).toBe(422);
  });

  it('rejects an invalid period', async () => {
    const { token } = await registerCompany('owner4@bill.test', 'Bill Co 4');

    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan: 'business', period: 2 });

    expect(res.status).toBe(422);
  });

  it('rejects an employee - checkout is owner/admin only', async () => {
    const { token: ownerToken } = await registerCompany('owner5@bill.test', 'Bill Co 5');
    const invite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Employee', email: 'employee5@bill.test', role: 'employee' });
    const inviteToken = new URL(invite.body.data.inviteLink as string).searchParams.get('token');
    const accept = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: inviteToken, password: strongPassword });
    const employeeToken = accept.body.data.accessToken as string;

    const res = await request(app)
      .post('/api/v1/billing/checkout')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ plan: 'business', period: 1 });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/billing/portal', () => {
  it('rejects a company with no Stripe customer yet', async () => {
    const { token } = await registerCompany('owner6@bill.test', 'Bill Co 6');

    const res = await request(app).post('/api/v1/billing/portal').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('creates a portal session for a company with an existing customer', async () => {
    const { token, companyId } = await registerCompany('owner7@bill.test', 'Bill Co 7');
    await CompanyModel.updateOne({ _id: companyId }, { $set: { stripeCustomerId: 'cus_7' } }).exec();

    vi.spyOn(stripeClient, 'getClient').mockReturnValue({
      billingPortal: {
        sessions: { create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/fake7' }) },
      },
    } as unknown as Stripe);

    const res = await request(app).post('/api/v1/billing/portal').set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.portalUrl).toBe('https://billing.stripe.com/fake7');
  });
});

describe('billingService.handleWebhookEvent', () => {
  // Signature verification (stripeClient.constructWebhookEvent) is Stripe's
  // own documented HMAC scheme and is exercised at the HTTP layer below
  // (missing-header case) - this block tests this codebase's own event ->
  // Company-state mapping logic directly, with a hand-built event object
  // instead of a real signed payload.
  function fakeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
    return { id: `evt_${type}`, type, data: { object } } as unknown as Stripe.Event;
  }

  it('activates the company and records the plan on checkout.session.completed', async () => {
    const { companyId } = await registerCompany('owner8@bill.test', 'Bill Co 8');
    await CompanyModel.updateOne(
      { _id: companyId },
      { $set: { status: CompanyStatus.PAST_DUE, pastDueSince: new Date() } },
    ).exec();

    await billingService.handleWebhookEvent(
      fakeEvent('checkout.session.completed', {
        client_reference_id: companyId,
        metadata: { plan: 'business' },
        subscription: 'sub_fake8',
      }),
    );

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.ACTIVE);
    expect(company?.subscriptionPlan).toBe(SubscriptionPlan.BUSINESS);
    expect(company?.stripeSubscriptionId).toBe('sub_fake8');
    expect(company?.pastDueSince).toBeNull();
  });

  it('marks the company past_due on invoice.payment_failed', async () => {
    const { companyId } = await registerCompany('owner9@bill.test', 'Bill Co 9');
    await CompanyModel.updateOne({ _id: companyId }, { $set: { stripeCustomerId: 'cus_9' } }).exec();

    await billingService.handleWebhookEvent(
      fakeEvent('invoice.payment_failed', { customer: 'cus_9' }),
    );

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.PAST_DUE);
    expect(company?.pastDueSince).not.toBeNull();
  });

  it('reactivates the company and refreshes currentPeriodEnd on invoice.payment_succeeded', async () => {
    const { companyId } = await registerCompany('owner10@bill.test', 'Bill Co 10');
    await CompanyModel.updateOne(
      { _id: companyId },
      { $set: { stripeCustomerId: 'cus_10', status: CompanyStatus.PAST_DUE, pastDueSince: new Date() } },
    ).exec();

    const futurePeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    vi.spyOn(stripeClient, 'getClient').mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ current_period_end: futurePeriodEnd }),
      },
    } as unknown as Stripe);

    await billingService.handleWebhookEvent(
      fakeEvent('invoice.payment_succeeded', { customer: 'cus_10', subscription: 'sub_10' }),
    );

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.ACTIVE);
    expect(company?.pastDueSince).toBeNull();
    expect(company?.currentPeriodEnd).not.toBeNull();
  });

  it('suspends the company on customer.subscription.deleted', async () => {
    const { companyId } = await registerCompany('owner11@bill.test', 'Bill Co 11');
    await CompanyModel.updateOne({ _id: companyId }, { $set: { stripeCustomerId: 'cus_11' } }).exec();

    await billingService.handleWebhookEvent(
      fakeEvent('customer.subscription.deleted', { customer: 'cus_11' }),
    );

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.SUSPENDED);
  });

  it('ignores an unhandled event type without throwing', async () => {
    await expect(
      billingService.handleWebhookEvent(fakeEvent('customer.updated', {})),
    ).resolves.toBeUndefined();
  });

  it('ignores an event for a customer id with no matching company', async () => {
    await expect(
      billingService.handleWebhookEvent(fakeEvent('invoice.payment_failed', { customer: 'cus_unknown' })),
    ).resolves.toBeUndefined();
  });
});

describe('POST /api/v1/billing/webhook', () => {
  it('rejects a request with no Stripe-Signature header', async () => {
    const res = await request(app).post('/api/v1/billing/webhook').send({ some: 'payload' });
    expect(res.status).toBe(400);
  });
});

describe('requireActiveSubscription', () => {
  it('blocks writes for a past_due company but still allows reads', async () => {
    const { token, companyId } = await registerCompany('owner12@bill.test', 'Bill Co 12');
    await CompanyModel.updateOne({ _id: companyId }, { $set: { status: CompanyStatus.PAST_DUE } }).exec();

    const writeRes = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Blocked' });
    expect(writeRes.status).toBe(403);

    const readRes = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`);
    expect(readRes.status).toBe(200);
  });

  it('blocks writes for a suspended company', async () => {
    const { token, companyId } = await registerCompany('owner13@bill.test', 'Bill Co 13');
    await CompanyModel.updateOne({ _id: companyId }, { $set: { status: CompanyStatus.SUSPENDED } }).exec();

    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Blocked' });
    expect(res.status).toBe(403);
  });

  it('still allows the billing router for a past_due company (it must stay reachable to fix payment)', async () => {
    const { token, companyId } = await registerCompany('owner14@bill.test', 'Bill Co 14');
    await CompanyModel.updateOne(
      { _id: companyId },
      { $set: { status: CompanyStatus.PAST_DUE, stripeCustomerId: 'cus_14' } },
    ).exec();

    vi.spyOn(stripeClient, 'getClient').mockReturnValue({
      billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/fake14' }) } },
    } as unknown as Stripe);

    const res = await request(app).post('/api/v1/billing/portal').set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('resource limits (Basic plan)', () => {
  it('rejects a second warehouse on Basic', async () => {
    const { token } = await registerCompany('owner15@bill.test', 'Bill Co 15');
    await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'First' });

    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second' });

    expect(res.status).toBe(403);
  });

  it('allows a second warehouse after upgrading to Business', async () => {
    const { token, companyId } = await registerCompany('owner16@bill.test', 'Bill Co 16');
    await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'First' });
    await CompanyModel.updateOne(
      { _id: companyId },
      { $set: { subscriptionPlan: SubscriptionPlan.BUSINESS } },
    ).exec();

    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second' });

    expect(res.status).toBe(201);
  });

  it('rejects a 4th user (owner + 3 invites) on Basic', async () => {
    const { token } = await registerCompany('owner17@bill.test', 'Bill Co 17');
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E1', email: 'e1@bill.test', role: 'employee' });
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2', email: 'e2@bill.test', role: 'employee' });

    // owner + 2 invites = 3, already at the Basic limit.
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E3', email: 'e3@bill.test', role: 'employee' });

    expect(res.status).toBe(403);
  });
});
