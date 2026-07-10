import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface Company {
  token: string;
}

async function registerCompany(email: string, companyName: string): Promise<Company> {
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

async function createSupplier(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/suppliers')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  return res.body.data.id as string;
}

interface Scenario {
  token: string;
  supplierId: string;
  warehouseId: string;
  productId: string;
}

async function baseScenario(email: string, companyName: string): Promise<Scenario> {
  const { token } = await registerCompany(email, companyName);
  const supplierId = await createSupplier(token, 'Coffee Supplier AS');
  const warehouseId = await createWarehouse(token, 'Main');
  const productId = await createProduct(token, `SKU-${email}`);
  return { token, supplierId, warehouseId, productId };
}

describe('POST /api/v1/purchases', () => {
  it('creates a draft purchase with a computed totalAmount', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner1@pur.test',
      'Purchase Co 1',
    );

    const res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        warehouseId,
        items: [{ productId, quantity: 50, unitPrice: 15 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.totalAmount).toBe(750);
  });

  it('rejects a supplier from another company', async () => {
    const companyA = await baseScenario('ownerA@pur.test', 'Purchase Co A');
    const companyB = await baseScenario('ownerB@pur.test', 'Purchase Co B');

    const res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({
        supplierId: companyB.supplierId,
        warehouseId: companyA.warehouseId,
        items: [{ productId: companyA.productId, quantity: 1, unitPrice: 1 }],
      });

    expect(res.status).toBe(404);
  });

  it('rejects a product from another company inside items', async () => {
    const companyA = await baseScenario('ownerA2@pur.test', 'Purchase Co A2');
    const companyB = await baseScenario('ownerB2@pur.test', 'Purchase Co B2');

    const res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({
        supplierId: companyA.supplierId,
        warehouseId: companyA.warehouseId,
        items: [{ productId: companyB.productId, quantity: 1, unitPrice: 1 }],
      });

    expect(res.status).toBe(404);
  });

  it('rejects duplicate productId within items', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner3@pur.test',
      'Purchase Co 3',
    );

    const res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        warehouseId,
        items: [
          { productId, quantity: 5, unitPrice: 1 },
          { productId, quantity: 3, unitPrice: 1 },
        ],
      });

    expect(res.status).toBe(422);
  });

  it('rejects creation by an employee (RBAC)', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner4@pur.test',
      'Purchase Co 4',
    );
    const employeeToken = await inviteEmployee(token, 'employee4@pur.test');

    const res = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 1, unitPrice: 1 }] });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/purchases/:id/complete', () => {
  it('increases inventory for each line item and marks the purchase completed', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner5@pur.test',
      'Purchase Co 5',
    );

    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        warehouseId,
        items: [{ productId, quantity: 40, unitPrice: 15 }],
      });

    const completed = await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('completed');
    expect(completed.body.data.completedAt).not.toBeNull();

    const inventoryList = await request(app)
      .get(`/api/v1/inventory?productId=${productId}&warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(inventoryList.body.data.items).toHaveLength(1);
    expect(inventoryList.body.data.items[0].quantity).toBe(40);
  });

  it('creates the inventory record automatically if none existed yet', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner6@pur.test',
      'Purchase Co 6',
    );
    // No prior POST /inventory call - completion must create the record.

    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 25, unitPrice: 10 }] });

    await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const inventoryList = await request(app)
      .get(`/api/v1/inventory?productId=${productId}&warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(inventoryList.body.data.items).toHaveLength(1);
    expect(inventoryList.body.data.items[0].quantity).toBe(25);
  });

  it('adds on top of existing stock rather than overwriting it', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner7@pur.test',
      'Purchase Co 7',
    );

    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 10 });

    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 15, unitPrice: 10 }] });

    await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const inventoryList = await request(app)
      .get(`/api/v1/inventory?productId=${productId}&warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(inventoryList.body.data.items[0].quantity).toBe(25);
  });

  it('rejects completing an already-completed purchase', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner8@pur.test',
      'Purchase Co 8',
    );
    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 5, unitPrice: 1 }] });

    await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const secondComplete = await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(secondComplete.status).toBe(409);
  });
});

describe('PATCH /api/v1/purchases/:id', () => {
  it('updates items and recomputes totalAmount while still a draft', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner9@pur.test',
      'Purchase Co 9',
    );
    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 10, unitPrice: 10 }] });

    const res = await request(app)
      .patch(`/api/v1/purchases/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId, quantity: 20, unitPrice: 10 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.totalAmount).toBe(200);
  });

  it('rejects editing a completed purchase', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner10@pur.test',
      'Purchase Co 10',
    );
    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 10, unitPrice: 10 }] });

    await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .patch(`/api/v1/purchases/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'trying to sneak an edit in' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/purchases/:id/cancel', () => {
  it('cancels a draft purchase without touching inventory', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner11@pur.test',
      'Purchase Co 11',
    );
    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 10, unitPrice: 10 }] });

    const res = await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');

    const inventoryList = await request(app)
      .get(`/api/v1/inventory?productId=${productId}&warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(inventoryList.body.data.items).toHaveLength(0);
  });

  it('rejects cancelling an already-completed purchase', async () => {
    const { token, supplierId, warehouseId, productId } = await baseScenario(
      'owner12@pur.test',
      'Purchase Co 12',
    );
    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 5, unitPrice: 1 }] });

    await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/purchases/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
  });
});

describe('Multi-tenant isolation for purchases', () => {
  it('404s when fetching another company purchase by id', async () => {
    const companyA = await baseScenario('ownerA3@pur.test', 'Purchase Co A3');
    const companyB = await baseScenario('ownerB3@pur.test', 'Purchase Co B3');

    const created = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({
        supplierId: companyA.supplierId,
        warehouseId: companyA.warehouseId,
        items: [{ productId: companyA.productId, quantity: 1, unitPrice: 1 }],
      });

    const res = await request(app)
      .get(`/api/v1/purchases/${created.body.data.id}`)
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(res.status).toBe(404);
  });
});
