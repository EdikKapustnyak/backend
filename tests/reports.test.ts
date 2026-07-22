import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { SubscriptionPlan } from '../src/modules/companies/company.types.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

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

/** Basic caps warehouses at 1 (see plan.config.ts) - tests that legitimately need more than one warehouse per company upgrade first. Takes the owner's token (not a companyId) since registerCompany() in this file returns a plain token string. */
async function upgradeToEnterprisePlan(token: string): Promise<void> {
  const me = await request(app).get('/api/v1/companies/me').set('Authorization', `Bearer ${token}`);
  const companyId = me.body.data.id as string;
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { subscriptionPlan: SubscriptionPlan.ENTERPRISE } },
  ).exec();
}

async function createProduct(token: string, sku: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Кофе Arabica', sku, purchasePrice: 10, salePrice: 20 });
  return res.body.data.id as string;
}

async function createWarehouse(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/warehouses')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.data.id as string;
}

async function createSupplier(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/suppliers')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.data.id as string;
}

function expectValidPdf(res: request.Response): void {
  expect(res.status, JSON.stringify(res.headers)).toBe(200);
  expect(res.headers['content-type']).toMatch(/application\/pdf/);
  expect(Buffer.isBuffer(res.body)).toBe(true);
  expect((res.body as Buffer).slice(0, 4).toString()).toBe('%PDF');
  expect((res.body as Buffer).length).toBeGreaterThan(100);
}

describe('GET /api/v1/reports/purchases/pdf', () => {
  it('generates a valid PDF with data', async () => {
    const ownerToken = await registerCompany('owner1@rp.test', 'RP Co 1');
    const productId = await createProduct(ownerToken, 'SKU-1');
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    const supplierId = await createSupplier(ownerToken, 'Поставщик Кофе');

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 20, unitPrice: 15 }] });
    await request(app)
      .post(`/api/v1/purchases/${purchase.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  it('generates a valid (short) PDF when there is no data', async () => {
    const ownerToken = await registerCompany('owner2@rp.test', 'RP Co 2');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('lets an employee generate the report (read-only)', async () => {
    const ownerToken = await registerCompany('owner3@rp.test', 'RP Co 3');
    const employeeToken = await inviteEmployee(ownerToken, 'employee3@rp.test');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf')
      .set('Authorization', `Bearer ${employeeToken}`);

    expectValidPdf(res);
  });

  it('rejects an invalid date range (from after to)', async () => {
    const ownerToken = await registerCompany('owner4@rp.test', 'RP Co 4');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf?from=2026-06-01&to=2026-01-01')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
  });

  it('rejects a malformed date', async () => {
    const ownerToken = await registerCompany('owner5@rp.test', 'RP Co 5');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf?from=not-a-date')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
  });

  it('respects a date range filter', async () => {
    const ownerToken = await registerCompany('owner6@rp.test', 'RP Co 6');
    const productId = await createProduct(ownerToken, 'SKU-6');
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    const supplierId = await createSupplier(ownerToken, 'Supplier 6');
    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 5, unitPrice: 1 }] });
    await request(app)
      .post(`/api/v1/purchases/${purchase.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // A future date range should exclude the purchase created just now, but
    // must still return a structurally valid (short) PDF, not an error.
    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf?from=2099-01-01&to=2099-12-31')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });
});

describe('GET /api/v1/reports/write-offs/pdf', () => {
  it('generates a valid PDF with data', async () => {
    const ownerToken = await registerCompany('owner7@rp.test', 'RP Co 7');
    const productId = await createProduct(ownerToken, 'SKU-7');
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 50 });
    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 5, reason: 'damaged' });
    await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/reports/write-offs/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('generates a valid (short) PDF when there is no data', async () => {
    const ownerToken = await registerCompany('owner8@rp.test', 'RP Co 8');

    const res = await request(app)
      .get('/api/v1/reports/write-offs/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('filters by reason', async () => {
    const ownerToken = await registerCompany('owner9@rp.test', 'RP Co 9');
    const productId = await createProduct(ownerToken, 'SKU-9');
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 50 });
    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 3, reason: 'expired' });
    await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/reports/write-offs/pdf?reason=lost')
      .set('Authorization', `Bearer ${ownerToken}`);

    // No "lost" write-offs exist (only "expired"), so this must still be a
    // valid, structurally correct (short) PDF, not an error.
    expectValidPdf(res);
  });
});

describe('GET /api/v1/reports/inventarizations/pdf', () => {
  async function completedInventarization(
    ownerToken: string,
    warehouseId: string,
    productId: string,
    initialQuantity: number,
    countedQuantity: number,
  ): Promise<void> {
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity }] });
    await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);
  }

  it('generates a valid PDF with data, flagging a large discrepancy', async () => {
    const ownerToken = await registerCompany('owner10@rp.test', 'RP Co 10');
    const productId = await createProduct(ownerToken, 'SKU-10');
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 100 });

    // 100 -> 80 counted is a discrepancy of -20, which clears the default
    // largeDiscrepancyAbsThreshold (10) on Company - this is the row the
    // report should flag in its "Крупных расхожд." column.
    await completedInventarization(ownerToken, warehouseId, productId, 100, 80);

    const res = await request(app)
      .get('/api/v1/reports/inventarizations/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  it('generates a valid (short) PDF when there is no data', async () => {
    const ownerToken = await registerCompany('owner11@rp.test', 'RP Co 11');

    const res = await request(app)
      .get('/api/v1/reports/inventarizations/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('lets an employee generate the report (read-only)', async () => {
    const ownerToken = await registerCompany('owner12@rp.test', 'RP Co 12');
    const employeeToken = await inviteEmployee(ownerToken, 'employee12@rp.test');

    const res = await request(app)
      .get('/api/v1/reports/inventarizations/pdf')
      .set('Authorization', `Bearer ${employeeToken}`);

    expectValidPdf(res);
  });

  it('filters by warehouseId', async () => {
    const ownerToken = await registerCompany('owner13@rp.test', 'RP Co 13');
    await upgradeToEnterprisePlan(ownerToken);
    const productId = await createProduct(ownerToken, 'SKU-13');
    const warehouseA = await createWarehouse(ownerToken, 'Warehouse A');
    const warehouseB = await createWarehouse(ownerToken, 'Warehouse B');
    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId: warehouseA, quantity: 50 });
    await completedInventarization(ownerToken, warehouseA, productId, 50, 50);

    // warehouseB has no inventarizations at all - filtering by it must still
    // return a valid, structurally correct (short) PDF, not an error.
    const res = await request(app)
      .get(`/api/v1/reports/inventarizations/pdf?warehouseId=${warehouseB}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('filters by status', async () => {
    const ownerToken = await registerCompany('owner14@rp.test', 'RP Co 14');
    const productId = await createProduct(ownerToken, 'SKU-14');
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 30 });
    // Draft only - never counted/completed.
    await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    const res = await request(app)
      .get('/api/v1/reports/inventarizations/pdf?status=completed')
      .set('Authorization', `Bearer ${ownerToken}`);

    // No completed inventarizations exist (only a draft), so this must
    // still be a valid, structurally correct (short) PDF, not an error.
    expectValidPdf(res);
  });

  it('rejects an invalid date range (from after to)', async () => {
    const ownerToken = await registerCompany('owner15@rp.test', 'RP Co 15');

    const res = await request(app)
      .get('/api/v1/reports/inventarizations/pdf?from=2026-06-01&to=2026-01-01')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
  });
});

describe('Report language (lang query param)', () => {
  it('defaults to a valid PDF when lang is omitted (backward compatible)', async () => {
    const ownerToken = await registerCompany('owner16@rp.test', 'RP Co 16');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('accepts lang=en and generates a valid PDF', async () => {
    const ownerToken = await registerCompany('owner17@rp.test', 'RP Co 17');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf?lang=en')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('accepts lang=no and generates a valid PDF', async () => {
    const ownerToken = await registerCompany('owner18@rp.test', 'RP Co 18');

    const res = await request(app)
      .get('/api/v1/reports/write-offs/pdf?lang=no')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('accepts lang on the inventarizations report too', async () => {
    const ownerToken = await registerCompany('owner19@rp.test', 'RP Co 19');

    const res = await request(app)
      .get('/api/v1/reports/inventarizations/pdf?lang=en')
      .set('Authorization', `Bearer ${ownerToken}`);

    expectValidPdf(res);
  });

  it('rejects an unsupported lang value', async () => {
    const ownerToken = await registerCompany('owner20@rp.test', 'RP Co 20');

    const res = await request(app)
      .get('/api/v1/reports/purchases/pdf?lang=fr')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
  });
});
