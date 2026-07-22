import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { anthropicClient } from '../src/utils/anthropicClient.js';
import { objectStorage } from '../src/utils/objectStorage.js';
import { WriteOffModel } from '../src/modules/write-offs/write-off.model.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';
const FAKE_NARRATIVE = 'Тестовый анализ и рекомендации.';

let askClaudeSpy: ReturnType<typeof vi.spyOn>;
let uploadSpy: ReturnType<typeof vi.spyOn>;
let presignSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  askClaudeSpy = vi.spyOn(anthropicClient, 'askClaude').mockResolvedValue(FAKE_NARRATIVE);
  uploadSpy = vi.spyOn(objectStorage, 'uploadObject').mockResolvedValue(undefined);
  // toPublicReceipt() (called after every receipt create/update) needs a
  // presigned view URL - without this mock, receipt creation in the revenue
  // analytics tests below 500s trying to reach real R2 with no credentials.
  presignSpy = vi
    .spyOn(objectStorage, 'getPresignedDownloadUrl')
    .mockResolvedValue('https://fake-bucket.example.test/signed-url?sig=abc');
});

afterEach(() => {
  askClaudeSpy.mockRestore();
  uploadSpy.mockRestore();
  presignSpy.mockRestore();
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
): Promise<string> {
  const draft = await request(app)
    .post('/api/v1/write-offs')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, warehouseId, quantity, reason });
  await request(app)
    .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
    .set('Authorization', `Bearer ${token}`);
  return draft.body.data.id as string;
}

async function createRevenueReceipt(token: string, amount: number, date: string): Promise<void> {
  await request(app)
    .post('/api/v1/receipts')
    .set('Authorization', `Bearer ${token}`)
    .field('type', 'daily_revenue')
    .field('amount', String(amount))
    .field('date', date)
    .attach('file', Buffer.from('fake jpeg bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });
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

  it('is available on the default Basic plan too (AI features are not plan-gated - confirmed decision)', async () => {
    const token = await registerCompany('owner6@an.test', 'AN Co 6');

    const res = await request(app)
      .get('/api/v1/analytics/waste/narrative')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(askClaudeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/analytics/revenue', () => {
  it('sums daily revenue receipts grouped by day', async () => {
    const token = await registerCompany('owner1@rev.test', 'REV Co 1');
    await createRevenueReceipt(token, 1000, '2026-01-10');
    await createRevenueReceipt(token, 500, '2026-01-10');
    await createRevenueReceipt(token, 250.5, '2026-01-11');

    const res = await request(app)
      .get('/api/v1/analytics/revenue?from=2026-01-01&to=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.totalRevenue).toBe(1750.5);
    expect(res.body.data.byDay).toHaveLength(2);
    expect(res.body.data.byDay[0]).toEqual({ date: '2026-01-10', amount: 1500 });
    expect(res.body.data.byDay[1]).toEqual({ date: '2026-01-11', amount: 250.5 });
    expect(res.body.data.daysWithData).toBe(2);
  });

  it('excludes receipts of other types and soft-deleted revenue receipts', async () => {
    const token = await registerCompany('owner2@rev.test', 'REV Co 2');
    await createRevenueReceipt(token, 1000, '2026-01-10');
    await request(app)
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${token}`)
      .field('type', 'expense')
      .field('amount', '9999')
      .attach('file', Buffer.from('fake'), { filename: 'r.jpg', contentType: 'image/jpeg' });

    const deletedReceipt = await request(app)
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${token}`)
      .field('type', 'daily_revenue')
      .field('amount', '4242')
      .field('date', '2026-01-12')
      .attach('file', Buffer.from('fake'), { filename: 'r2.jpg', contentType: 'image/jpeg' });
    await request(app)
      .delete(`/api/v1/receipts/${deletedReceipt.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/v1/analytics/revenue?from=2026-01-01&to=2026-01-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.totalRevenue).toBe(1000);
    expect(res.body.data.byDay).toHaveLength(1);
  });

  it('returns zeros for a company with no revenue receipts', async () => {
    const token = await registerCompany('owner3@rev.test', 'REV Co 3');

    const res = await request(app)
      .get('/api/v1/analytics/revenue')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.totalRevenue).toBe(0);
    expect(res.body.data.daysWithData).toBe(0);
    expect(res.body.data.byDay).toHaveLength(0);
  });

  it('rejects an invalid date range', async () => {
    const token = await registerCompany('owner4@rev.test', 'REV Co 4');

    const res = await request(app)
      .get('/api/v1/analytics/revenue?from=2026-06-01&to=2026-01-01')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

describe('Multi-tenant isolation for revenue analytics', () => {
  it('does not include another company revenue receipts', async () => {
    const tokenA = await registerCompany('ownerA@rev.test', 'REV Co A');
    const tokenB = await registerCompany('ownerB@rev.test', 'REV Co B');
    await createRevenueReceipt(tokenA, 1000, '2026-01-10');

    const res = await request(app)
      .get('/api/v1/analytics/revenue?from=2026-01-01&to=2026-01-31')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.body.data.totalRevenue).toBe(0);
  });
});

describe('configurable default lookback (Company.wasteAnalyticsDefaultLookbackDays)', () => {
  it('excludes a write-off older than the default 30-day lookback, but includes it once the company widens the window', async () => {
    const token = await registerCompany('owner7@an.test', 'AN Co 7');
    const productId = await createProduct(token, 'SKU-7', 10);
    const warehouseId = await createWarehouse(token, 'Main');
    await createInventory(token, productId, warehouseId, 100);
    const writeOffId = await confirmedWriteOff(token, productId, warehouseId, 5, 'damaged');

    // Mongoose marks the auto-generated `createdAt` immutable when
    // `timestamps: true` is set (write-off.model.ts) - a Mongoose-level
    // updateOne silently ignores an attempt to change it, regardless of
    // skipTenantScope. Going through the raw driver collection (same
    // bypass tests/setup.ts uses for its own reason) sidesteps Mongoose's
    // schema casting/immutability enforcement entirely.
    await WriteOffModel.collection.updateOne(
      { _id: new Types.ObjectId(writeOffId) },
      { $set: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } },
    );

    const defaultRes = await request(app)
      .get('/api/v1/analytics/waste')
      .set('Authorization', `Bearer ${token}`);
    expect(defaultRes.body.data.totalQuantity).toBe(0);

    await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ wasteAnalyticsDefaultLookbackDays: 60 });

    const widenedRes = await request(app)
      .get('/api/v1/analytics/waste')
      .set('Authorization', `Bearer ${token}`);
    expect(widenedRes.body.data.totalQuantity).toBe(5);
  });

  it('applies the same configurable lookback to revenue analytics', async () => {
    const token = await registerCompany('owner8@an.test', 'AN Co 8');
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await createRevenueReceipt(token, 1000, oldDate.toISOString().slice(0, 10));

    const defaultRes = await request(app)
      .get('/api/v1/analytics/revenue')
      .set('Authorization', `Bearer ${token}`);
    expect(defaultRes.body.data.totalRevenue).toBe(0);

    await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ wasteAnalyticsDefaultLookbackDays: 60 });

    const widenedRes = await request(app)
      .get('/api/v1/analytics/revenue')
      .set('Authorization', `Bearer ${token}`);
    expect(widenedRes.body.data.totalRevenue).toBe(1000);
  });
});
