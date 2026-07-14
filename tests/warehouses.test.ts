import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { SubscriptionPlan } from '../src/modules/companies/company.types.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface RegisteredCompany {
  token: string;
  companyId: string;
}

async function registerCompany(email: string, companyName: string): Promise<RegisteredCompany> {
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

/** Basic caps warehouses at 1 (see plan.config.ts) - tests that legitimately need more than one warehouse per company upgrade first. */
async function upgradeToEnterprisePlan(companyId: string): Promise<void> {
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { subscriptionPlan: SubscriptionPlan.ENTERPRISE } },
  ).exec();
}

describe('POST /api/v1/warehouses', () => {
  it('creates a warehouse for the caller company (owner)', async () => {
    const { token } = await registerCompany('owner1@wh.test', 'Warehouse Co 1');

    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Main Warehouse', location: 'Stavanger' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Main Warehouse');
    expect(res.body.data.isActive).toBe(true);
  });

  it('rejects creation by an employee (RBAC)', async () => {
    const { token } = await registerCompany('owner2@wh.test', 'Warehouse Co 2');
    const employeeToken = await inviteEmployee(token, 'employee2@wh.test');

    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ name: 'Backdoor Warehouse' });

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate warehouse name within the same company', async () => {
    const { token, companyId } = await registerCompany('owner3@wh.test', 'Warehouse Co 3');
    await upgradeToEnterprisePlan(companyId);

    await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Central' });

    const res = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Central' });

    expect(res.status).toBe(409);
  });

  it('allows the same warehouse name in two different companies', async () => {
    const companyA = await registerCompany('ownerA@wh.test', 'Company A WH');
    const companyB = await registerCompany('ownerB@wh.test', 'Company B WH');

    const resA = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ name: 'Central' });
    const resB = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${companyB.token}`)
      .send({ name: 'Central' });

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });
});

describe('Multi-tenant isolation for warehouses', () => {
  it('returns 404, not the resource, when fetching another company warehouse by id', async () => {
    const companyA = await registerCompany('ownerA2@wh.test', 'Company A2');
    const companyB = await registerCompany('ownerB2@wh.test', 'Company B2');

    const created = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ name: 'A2 Warehouse' });
    const warehouseId = created.body.data.id as string;

    const res = await request(app)
      .get(`/api/v1/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(res.status).toBe(404);
  });

  it('does not include another company warehouses in the list', async () => {
    const companyA = await registerCompany('ownerA3@wh.test', 'Company A3');
    const companyB = await registerCompany('ownerB3@wh.test', 'Company B3');

    await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ name: 'A3 Warehouse' });
    await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${companyB.token}`)
      .send({ name: 'B3 Warehouse' });

    const listA = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${companyA.token}`);

    const names = listA.body.data.items.map((w: { name: string }) => w.name);
    expect(names).toContain('A3 Warehouse');
    expect(names).not.toContain('B3 Warehouse');
  });
});

describe('PATCH & DELETE /api/v1/warehouses/:id', () => {
  it('updates a warehouse', async () => {
    const { token } = await registerCompany('owner4@wh.test', 'Warehouse Co 4');
    const created = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Old Name' });

    const res = await request(app)
      .patch(`/api/v1/warehouses/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('soft-deletes (deactivates) a warehouse and rejects deactivating it twice', async () => {
    const { token } = await registerCompany('owner5@wh.test', 'Warehouse Co 5');
    const created = await request(app)
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Deactivate' });

    const firstDelete = await request(app)
      .delete(`/api/v1/warehouses/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(firstDelete.status).toBe(200);
    expect(firstDelete.body.data.isActive).toBe(false);

    const secondDelete = await request(app)
      .delete(`/api/v1/warehouses/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondDelete.status).toBe(409);
  });

  it('rejects an invalid ObjectId in the URL', async () => {
    const { token } = await registerCompany('owner6@wh.test', 'Warehouse Co 6');

    const res = await request(app)
      .get('/api/v1/warehouses/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/warehouses pagination', () => {
  it('paginates results', async () => {
    const { token, companyId } = await registerCompany('owner7@wh.test', 'Warehouse Co 7');
    await upgradeToEnterprisePlan(companyId);

    for (let i = 1; i <= 5; i += 1) {
      await request(app)
        .post('/api/v1/warehouses')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `WH ${i}` });
    }

    const res = await request(app)
      .get('/api/v1/warehouses?page=1&perPage=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      perPage: 2,
      totalItems: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });
});
