import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { anthropicClient } from '../src/utils/anthropicClient.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { SubscriptionPlan } from '../src/modules/companies/company.types.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';
const FAKE_NARRATIVE = 'Тестовый анализ и рекомендации.';

let askClaudeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  askClaudeSpy = vi.spyOn(anthropicClient, 'askClaude').mockResolvedValue(FAKE_NARRATIVE);
});

afterEach(() => {
  askClaudeSpy.mockRestore();
});

async function registerCompany(email: string, companyName: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    city: 'Stavanger',
    ownerName: 'Owner',
    email,
    password: strongPassword,
  });
  return res.body.data.accessToken as string;
}

async function createProduct(token: string, sku: string, purchasePrice: number): Promise<string> {
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Coffee Arabica', sku, purchasePrice, salePrice: purchasePrice * 2 });
  return res.body.data.id as string;
}

async function createWarehouse(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.data.id as string;
}

/** The AI narrative endpoint is gated behind Business+ (see requireFeature('ai')) - Basic is the default plan every test company starts on. */
async function upgradeToBusinessPlan(token: string): Promise<void> {
  const me = await request(app).get('/api/v1/companies/me').set('Authorization', `Bearer ${token}`);
  const companyId = me.body.data.id as string;
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { subscriptionPlan: SubscriptionPlan.BUSINESS } },
  ).exec();
}

async function createInventory(
  token: string,
  productId: string,
  warehouseId: string,
  quantity: number,
): Promise<void> {
  await request(app)
    .post('/api/v1/inventory')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, warehouseId, quantity });
}

async function confirmedWriteOff(
  token: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  reason: string,
): Promise<void> {
  const draft = await request(app)
    .post('/api/v1/write-offs')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, warehouseId, quantity, reason });
  await request(app)
    .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
    .set('Authorization', `Bearer ${token}`);
}

describe('GET /api/v1/analytics/waste', () => {
  it('aggregates confirmed write-offs by product and reason with an estimated cost', async () => {
    const token = await registerCompany('owner1@an.test', 'AN Co 1');
    const productId = await createProduct(token, 'SKU-1', 10);
    const warehouseId = await createWarehouse(token, 'Main');
    await createInventory(token, productId, warehouseId, 100);
    await confirmedWriteOff(token, productId, warehouseId, 5, 'damaged');
    await confirmedWriteOff(token, productId, warehouseId, 3, 'expired');

    const res = await request(app)
      .get('/api/v1/analytics/waste')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.totalQuantity).toBe(8);
    expect(res.body.data.totalEstimatedCost).toBe(80); // 8 units * purchasePrice 10
    expect(res.body.data.byProduct).toHaveLength(1);
    expect(res.body.data.byProduct[0].quantity).toBe(8);
    expect(res.body.data.byReason).toHaveLength(2);
    expect(askClaudeSpy).not.toHaveBeenCalled();
  });

  it('computes a waste ratio against completed purchases in the same period', async () => {
    const token = await registerCompany('owner2@an.test', 'AN Co 2');
    const productId = await createProduct(token, 'SKU-2', 10);
    const warehouseId = await createWarehouse(token, 'Main');
    const supplierRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Supplier' });
    const supplierId = supplierRes.body.data.id as string;

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 100, unitPrice: 10 }] });
    await request(app)
      .post(`/api/v1/purchases/${purchase.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    await confirmedWriteOff(token, productId, warehouseId, 10, 'damaged');

    const res = await request(app)
      .get('/api/v1/analytics/waste')
      .set('Authorization', `Bearer ${token}`);

    // 10 units * 10 purchasePrice = 100 waste, purchases total = 1000 -> 10%
    expect(res.body.data.wasteRatioPercent).toBe(10);
  });

  it('returns zeros for a company with no write-offs', async () => {
    const token = await registerCompany('owner3@an.test', 'AN Co 3');

    const res = await request(app)
      .get('/api/v1/analytics/waste')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.totalQuantity).toBe(0);
    expect(res.body.data.byProduct).toHaveLength(0);
  });

  it('rejects an invalid date range', async () => {
    const token = await registerCompany('owner4@an.test', 'AN Co 4');

    const res = await request(app)
      .get('/api/v1/analytics/waste?from=2026-06-01&to=2026-01-01')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

describe('Multi-tenant isolation for waste analytics', () => {
  it('does not include another company write-offs', async () => {
    const tokenA = await registerCompany('ownerA@an.test', 'AN Co A');
    const tokenB = await registerCompany('ownerB@an.test', 'AN Co B');
    const productA = await createProduct(tokenA, 'SKU-A', 10);
    const warehouseA = await createWarehouse(tokenA, 'Main');
    await createInventory(tokenA, productA, warehouseA, 50);
    await confirmedWriteOff(tokenA, productA, warehouseA, 5, 'damaged');

    const res = await request(app)
      .get('/api/v1/analytics/waste')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.body.data.totalQuantity).toBe(0);
  });
});

describe('GET /api/v1/analytics/waste/narrative', () => {
  it('includes the deterministic numbers plus a mocked AI narrative', async () => {
    const token = await registerCompany('owner5@an.test', 'AN Co 5');
    await upgradeToBusinessPlan(token);
    const productId = await createProduct(token, 'SKU-5', 10);
    const warehouseId = await createWarehouse(token, 'Main');
    await createInventory(token, productId, warehouseId, 50);
    await confirmedWriteOff(token, productId, warehouseId, 5, 'damaged');

    const res = await request(app)
      .get('/api/v1/analytics/waste/narrative')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.narrative).toBe(FAKE_NARRATIVE);
    expect(res.body.data.totalQuantity).toBe(5);
    expect(askClaudeSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a Basic-plan company with 403 (AI narrative requires Business+)', async () => {
    const token = await registerCompany('owner6@an.test', 'AN Co 6');

    const res = await request(app)
      .get('/api/v1/analytics/waste/narrative')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(askClaudeSpy).not.toHaveBeenCalled();
  });
});
