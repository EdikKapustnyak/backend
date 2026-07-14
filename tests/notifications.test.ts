import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface Company {
  ownerToken: string;
  employeeToken: string;
}

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

async function createProduct(token: string, sku: string, minStockLevel: number): Promise<string> {
  const res = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Coffee Arabica', sku, purchasePrice: 10, salePrice: 20, minStockLevel });
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
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/inventory')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, warehouseId, quantity });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

async function companyWithRoles(email: string, companyName: string): Promise<Company> {
  const ownerToken = await registerCompany(email, companyName);
  const employeeToken = await inviteEmployee(ownerToken, `employee-${email}`);
  return { ownerToken, employeeToken };
}

describe('Low-stock notifications', () => {
  it('opens on initial inventory creation if the starting quantity is already at/below minStockLevel', async () => {
    const { ownerToken } = await companyWithRoles('owner1@nt.test', 'NT Co 1');
    const productId = await createProduct(ownerToken, 'SKU-1', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');

    await createInventory(ownerToken, productId, warehouseId, 15);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].type).toBe('low_stock');
    expect(res.body.data.items[0].status).toBe('open');
    expect(res.body.data.items[0].quantity).toBe(15);
    expect(res.body.data.items[0].minStockLevel).toBe(20);
  });

  it('auto-resolves once a purchase brings stock back above minStockLevel', async () => {
    const { ownerToken } = await companyWithRoles('owner2@nt.test', 'NT Co 2');
    const productId = await createProduct(ownerToken, 'SKU-2', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 15);
    const supplierRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Supplier Co' });
    const supplierId = supplierRes.body.data.id as string;

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ supplierId, warehouseId, items: [{ productId, quantity: 30, unitPrice: 5 }] });
    await request(app)
      .post(`/api/v1/purchases/${purchase.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const openList = await request(app)
      .get('/api/v1/notifications?status=open')
      .set('Authorization', `Bearer ${ownerToken}`);
    const resolvedList = await request(app)
      .get('/api/v1/notifications?status=resolved')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(openList.body.data.items).toHaveLength(0);
    expect(resolvedList.body.data.items).toHaveLength(1);
    expect(resolvedList.body.data.items[0].resolvedAt).not.toBeNull();
  });

  it('opens when a write-off pushes stock at/below minStockLevel', async () => {
    const { ownerToken } = await companyWithRoles('owner3@nt.test', 'NT Co 3');
    const productId = await createProduct(ownerToken, 'SKU-3', 10);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 15);

    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 8, reason: 'damaged' });
    await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(7);
  });

  it('dedupes repeated triggers into a single open notification and keeps it fresh', async () => {
    const { ownerToken } = await companyWithRoles('owner4@nt.test', 'NT Co 4');
    const productId = await createProduct(ownerToken, 'SKU-4', 10);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    const inventoryId = await createInventory(ownerToken, productId, warehouseId, 50);

    await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantityDelta: -45 }); // 5 left, below 10

    await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantityDelta: -2 }); // 3 left, still below 10

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
  });
});

describe('Inventarization discrepancy notifications', () => {
  it('flags a large discrepancy (and also opens low-stock if applicable)', async () => {
    const { ownerToken } = await companyWithRoles('owner5@nt.test', 'NT Co 5');
    const productId = await createProduct(ownerToken, 'SKU-5', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 100);

    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 15 }] }); // discrepancy -85
    await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const discrepancyList = await request(app)
      .get('/api/v1/notifications?type=inventarization_discrepancy')
      .set('Authorization', `Bearer ${ownerToken}`);
    const lowStockList = await request(app)
      .get('/api/v1/notifications?type=low_stock')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(discrepancyList.body.data.items).toHaveLength(1);
    expect(discrepancyList.body.data.items[0].discrepancy).toBe(-85);
    expect(discrepancyList.body.data.items[0].referenceId).toBe(created.body.data.id);
    expect(lowStockList.body.data.items).toHaveLength(1);
  });

  it('does not flag a small discrepancy', async () => {
    const { ownerToken } = await companyWithRoles('owner6@nt.test', 'NT Co 6');
    const productId = await createProduct(ownerToken, 'SKU-6', 5);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 100);

    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 96 }] }); // discrepancy -4, small
    await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('respects a per-company custom discrepancy threshold (PATCH /companies/me)', async () => {
    const { ownerToken } = await companyWithRoles('owner7@nt.test', 'NT Co 7');
    const productId = await createProduct(ownerToken, 'SKU-7', 5);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 100);

    // Under the default threshold (abs >= 10 or >= 20%), a discrepancy of
    // -4 (4%) would NOT flag - see "does not flag a small discrepancy"
    // above. Lowering the company's own abs threshold to 3 must make that
    // same -4 discrepancy flag instead, proving the setting is actually
    // read, not just stored.
    const patchRes = await request(app)
      .patch('/api/v1/companies/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ largeDiscrepancyAbsThreshold: 3 });
    expect(patchRes.status, JSON.stringify(patchRes.body)).toBe(200);
    expect(patchRes.body.data.largeDiscrepancyAbsThreshold).toBe(3);

    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 96 }] }); // discrepancy -4
    await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/notifications?type=inventarization_discrepancy')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].discrepancy).toBe(-4);
  });
});

describe('PATCH /api/v1/notifications/:id/resolve', () => {
  it('lets an employee resolve a notification', async () => {
    const { ownerToken, employeeToken } = await companyWithRoles('owner7@nt.test', 'NT Co 7');
    const productId = await createProduct(ownerToken, 'SKU-7', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 5);

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const notificationId = list.body.data.items[0].id as string;

    const res = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/resolve`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('rejects resolving an already-resolved notification', async () => {
    const { ownerToken } = await companyWithRoles('owner8@nt.test', 'NT Co 8');
    const productId = await createProduct(ownerToken, 'SKU-8', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 5);
    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    const notificationId = list.body.data.items[0].id as string;

    await request(app)
      .patch(`/api/v1/notifications/${notificationId}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const secondResolve = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(secondResolve.status).toBe(409);
  });
});

describe('GET /api/v1/notifications is read-only', () => {
  it('has no POST route', async () => {
    const ownerToken = await registerCompany('owner9@nt.test', 'NT Co 9');

    const res = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: 'hand-crafted alert' });

    expect(res.status).toBe(404);
  });
});

describe('Multi-tenant isolation for notifications', () => {
  it('404s when fetching another company notification by id', async () => {
    const ownerA = await registerCompany('ownerA@nt.test', 'NT Co A');
    const ownerB = await registerCompany('ownerB@nt.test', 'NT Co B');
    const productId = await createProduct(ownerA, 'SKU-A', 20);
    const warehouseId = await createWarehouse(ownerA, 'Main');
    await createInventory(ownerA, productId, warehouseId, 5);

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerA}`);
    const notificationId = list.body.data.items[0].id as string;

    const res = await request(app)
      .get(`/api/v1/notifications/${notificationId}`)
      .set('Authorization', `Bearer ${ownerB}`);

    expect(res.status).toBe(404);
  });
});
