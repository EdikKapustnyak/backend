import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

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
  await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Employee', email, password: strongPassword, role: 'employee' });

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: strongPassword });
  return login.body.data.accessToken as string;
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
