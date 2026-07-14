import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { SubscriptionPlan } from '../src/modules/companies/company.types.js';

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

/** Basic caps warehouses at 1 (see plan.config.ts) - tests that legitimately need more than one warehouse per company upgrade first. */
async function upgradeToEnterprisePlan(companyId: string): Promise<void> {
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { subscriptionPlan: SubscriptionPlan.ENTERPRISE } },
  ).exec();
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

async function createProduct(token: string, sku: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Coffee Arabica', sku, purchasePrice: 10, salePrice: 20 });
  return res.body.data.id as string;
}

async function createWarehouse(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.data.id as string;
}

describe('POST /api/v1/inventory', () => {
  it('creates a stock record defaulting quantity/reserved to 0', async () => {
    const { token } = await registerCompany('owner1@inv.test', 'Inv Co 1');
    const productId = await createProduct(token, 'SKU-1');
    const warehouseId = await createWarehouse(token, 'Main');

    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId });

    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(0);
    expect(res.body.data.reserved).toBe(0);
    expect(res.body.data.available).toBe(0);
  });

  it('accepts an explicit initial quantity', async () => {
    const { token } = await registerCompany('owner2@inv.test', 'Inv Co 2');
    const productId = await createProduct(token, 'SKU-2');
    const warehouseId = await createWarehouse(token, 'Main');

    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 100 });

    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(100);
    expect(res.body.data.available).toBe(100);
  });

  it('rejects a duplicate record for the same product+warehouse', async () => {
    const { token } = await registerCompany('owner3@inv.test', 'Inv Co 3');
    const productId = await createProduct(token, 'SKU-3');
    const warehouseId = await createWarehouse(token, 'Main');

    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId });

    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId });

    expect(res.status).toBe(409);
  });

  it('404s when the product belongs to another company', async () => {
    const companyA = await registerCompany('ownerA@inv.test', 'Inv Co A');
    const companyB = await registerCompany('ownerB@inv.test', 'Inv Co B');
    const foreignProductId = await createProduct(companyB.token, 'SKU-FOREIGN');
    const warehouseId = await createWarehouse(companyA.token, 'Main');

    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ productId: foreignProductId, warehouseId });

    expect(res.status).toBe(404);
  });

  it('rejects creation by an employee (RBAC)', async () => {
    const { token } = await registerCompany('owner4@inv.test', 'Inv Co 4');
    const employeeToken = await inviteEmployee(token, 'employee4@inv.test');
    const productId = await createProduct(token, 'SKU-4');
    const warehouseId = await createWarehouse(token, 'Main');

    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/inventory/:id/adjust', () => {
  async function setupInventory(email: string, companyName: string, quantity = 50) {
    const { token } = await registerCompany(email, companyName);
    const productId = await createProduct(token, 'SKU-ADJ');
    const warehouseId = await createWarehouse(token, 'Main');
    const created = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity });
    return { token, inventoryId: created.body.data.id as string };
  }

  it('increases quantity (simulating a purchase receipt)', async () => {
    const { token, inventoryId } = await setupInventory('owner5@inv.test', 'Inv Co 5', 50);

    const res = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantityDelta: 30 });

    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBe(80);
    expect(res.body.data.available).toBe(80);
  });

  it('decreases quantity (simulating a write-off)', async () => {
    const { token, inventoryId } = await setupInventory('owner6@inv.test', 'Inv Co 6', 50);

    const res = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantityDelta: -20 });

    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBe(30);
  });

  it('rejects a decrease that would go below zero', async () => {
    const { token, inventoryId } = await setupInventory('owner7@inv.test', 'Inv Co 7', 10);

    const res = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantityDelta: -20 });

    expect(res.status).toBe(409);
  });

  it('reserves stock, then rejects reserving more than is available', async () => {
    const { token, inventoryId } = await setupInventory('owner8@inv.test', 'Inv Co 8', 10);

    const reserveOk = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reservedDelta: 10 });
    expect(reserveOk.status).toBe(200);
    expect(reserveOk.body.data.reserved).toBe(10);
    expect(reserveOk.body.data.available).toBe(0);

    const reserveTooMuch = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reservedDelta: 1 });
    expect(reserveTooMuch.status).toBe(409);
  });

  it('releases previously reserved stock', async () => {
    const { token, inventoryId } = await setupInventory('owner9@inv.test', 'Inv Co 9', 10);

    await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reservedDelta: 5 });

    const release = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reservedDelta: -5 });

    expect(release.status).toBe(200);
    expect(release.body.data.reserved).toBe(0);
    expect(release.body.data.available).toBe(10);
  });

  it('rejects a request with no deltas', async () => {
    const { token, inventoryId } = await setupInventory('owner10@inv.test', 'Inv Co 10', 10);

    const res = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(422);
  });

  it('rejects adjustment by an employee (RBAC)', async () => {
    const { token, inventoryId } = await setupInventory('owner11@inv.test', 'Inv Co 11', 10);
    const employeeToken = await inviteEmployee(token, 'employee11@inv.test');

    const res = await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ quantityDelta: 1 });

    expect(res.status).toBe(403);
  });
});

describe('Multi-tenant isolation for inventory', () => {
  it('404s when fetching another company inventory record by id', async () => {
    const companyA = await registerCompany('ownerA2@inv.test', 'Inv Co A2');
    const companyB = await registerCompany('ownerB2@inv.test', 'Inv Co B2');
    const productId = await createProduct(companyA.token, 'SKU-A2');
    const warehouseId = await createWarehouse(companyA.token, 'Main');
    const created = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ productId, warehouseId });

    const res = await request(app)
      .get(`/api/v1/inventory/${created.body.data.id}`)
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/inventory filtering', () => {
  it('filters by warehouseId', async () => {
    const { token, companyId } = await registerCompany('owner12@inv.test', 'Inv Co 12');
    await upgradeToEnterprisePlan(companyId);
    const productId = await createProduct(token, 'SKU-12');
    const warehouseA = await createWarehouse(token, 'Warehouse A');
    const warehouseB = await createWarehouse(token, 'Warehouse B');

    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId: warehouseA });
    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId: warehouseB });

    const res = await request(app)
      .get(`/api/v1/inventory?warehouseId=${warehouseA}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].warehouseId).toBe(warehouseA);
  });
});
