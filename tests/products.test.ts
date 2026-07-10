import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface RegisteredCompany {
  token: string;
}

async function registerCompany(email: string, companyName: string): Promise<RegisteredCompany> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    ownerName: 'Owner',
    email,
    password: strongPassword,
  });
  return { token: res.body.data.accessToken as string };
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

function coffeePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Coffee Arabica 1kg',
    sku: 'COFFEE-001',
    category: 'Beverages',
    purchasePrice: 15,
    salePrice: 25,
    unit: 'kg',
    minStockLevel: 20,
    barcode: '123456789012',
    ...overrides,
  };
}

describe('POST /api/v1/products', () => {
  it('creates a product for the caller company (owner)', async () => {
    const { token } = await registerCompany('owner1@prod.test', 'Product Co 1');

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload());

    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe('COFFEE-001');
    expect(res.body.data.unit).toBe('kg');
    expect(res.body.data.isActive).toBe(true);
  });

  it('applies the default unit ("pcs") and minStockLevel (0) when omitted', async () => {
    const { token } = await registerCompany('owner1b@prod.test', 'Product Co 1b');

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Generic Item', sku: 'GEN-1', purchasePrice: 1, salePrice: 2 });

    expect(res.status).toBe(201);
    expect(res.body.data.unit).toBe('pcs');
    expect(res.body.data.minStockLevel).toBe(0);
  });

  it('rejects creation by an employee (RBAC)', async () => {
    const { token } = await registerCompany('owner2@prod.test', 'Product Co 2');
    const employeeToken = await inviteEmployee(token, 'employee2@prod.test');

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(coffeePayload({ sku: 'COFFEE-002' }));

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate SKU within the same company', async () => {
    const { token } = await registerCompany('owner3@prod.test', 'Product Co 3');

    await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload());

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload({ name: 'Different Name', barcode: '999999999999' }));

    expect(res.status).toBe(409);
  });

  it('rejects a duplicate barcode within the same company', async () => {
    const { token } = await registerCompany('owner3b@prod.test', 'Product Co 3b');

    await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload());

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload({ sku: 'COFFEE-DIFFERENT' }));

    expect(res.status).toBe(409);
  });

  it('allows the same SKU in two different companies', async () => {
    const companyA = await registerCompany('ownerA@prod.test', 'Company A Prod');
    const companyB = await registerCompany('ownerB@prod.test', 'Company B Prod');

    const resA = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send(coffeePayload());
    const resB = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${companyB.token}`)
      .send(coffeePayload());

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });

  it('allows two products with no barcode in the same company (regression: partial index, not sparse)', async () => {
    const { token } = await registerCompany('owner3c@prod.test', 'Product Co 3c');

    const first = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Barcode One', sku: 'NO-BARCODE-1', purchasePrice: 1, salePrice: 2 });
    const second = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Barcode Two', sku: 'NO-BARCODE-2', purchasePrice: 1, salePrice: 2 });

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
  });

  it('rejects a negative price', async () => {
    const { token } = await registerCompany('owner4@prod.test', 'Product Co 4');

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload({ salePrice: -5 }));

    expect(res.status).toBe(422);
  });
});

describe('Multi-tenant isolation for products', () => {
  it('returns 404 when fetching another company product by id', async () => {
    const companyA = await registerCompany('ownerA2@prod.test', 'Company A2 Prod');
    const companyB = await registerCompany('ownerB2@prod.test', 'Company B2 Prod');

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send(coffeePayload());
    const productId = created.body.data.id as string;

    const res = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/products search', () => {
  it('finds a product by partial SKU or name (case-insensitive)', async () => {
    const { token } = await registerCompany('owner5@prod.test', 'Product Co 5');
    await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload());

    const bySku = await request(app)
      .get('/api/v1/products?search=coffee-001')
      .set('Authorization', `Bearer ${token}`);
    const byName = await request(app)
      .get('/api/v1/products?search=arabica')
      .set('Authorization', `Bearer ${token}`);

    expect(bySku.body.data.items).toHaveLength(1);
    expect(byName.body.data.items).toHaveLength(1);
  });
});

describe('PATCH & DELETE /api/v1/products/:id', () => {
  it('updates a product (SKU is immutable)', async () => {
    const { token } = await registerCompany('owner6@prod.test', 'Product Co 6');
    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload());

    const res = await request(app)
      .patch(`/api/v1/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ salePrice: 30 });

    expect(res.status).toBe(200);
    expect(res.body.data.salePrice).toBe(30);
    expect(res.body.data.sku).toBe('COFFEE-001');
  });

  it('soft-deletes (deactivates) a product and rejects deactivating it twice', async () => {
    const { token } = await registerCompany('owner7@prod.test', 'Product Co 7');
    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(coffeePayload());

    const firstDelete = await request(app)
      .delete(`/api/v1/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(firstDelete.status).toBe(200);
    expect(firstDelete.body.data.isActive).toBe(false);

    const secondDelete = await request(app)
      .delete(`/api/v1/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondDelete.status).toBe(409);
  });
});
