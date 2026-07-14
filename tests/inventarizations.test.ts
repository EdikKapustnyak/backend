import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { inventoryRepository } from '../src/modules/inventory/inventory.repository.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

interface Scenario {
  ownerToken: string;
  employeeToken: string;
  warehouseId: string;
  productId: string;
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

async function createInventory(
  token: string,
  productId: string,
  warehouseId: string,
  quantity: number,
): Promise<void> {
  const res = await request(app)
    .post('/api/v1/inventory')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, warehouseId, quantity });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

async function getInventoryQuantity(
  token: string,
  productId: string,
  warehouseId: string,
): Promise<number> {
  const res = await request(app)
    .get(`/api/v1/inventory?productId=${productId}&warehouseId=${warehouseId}`)
    .set('Authorization', `Bearer ${token}`);
  return res.body.data.items[0].quantity as number;
}

async function baseScenario(
  email: string,
  companyName: string,
  initialQuantity = 100,
): Promise<Scenario> {
  const ownerToken = await registerCompany(email, companyName);
  const employeeToken = await inviteEmployee(ownerToken, `employee-${email}`);
  const productId = await createProduct(ownerToken, `SKU-${email}`);
  const warehouseId = await createWarehouse(ownerToken, 'Main');
  await createInventory(ownerToken, productId, warehouseId, initialQuantity);
  return { ownerToken, employeeToken, warehouseId, productId };
}

describe('POST /api/v1/inventarizations', () => {
  it('auto-populates items from existing stock when productIds is omitted', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario('owner1@iv.test', 'IV Co 1', 100);

    const res = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productId).toBe(productId);
    expect(res.body.data.items[0].systemQuantity).toBe(100);
    expect(res.body.data.items[0].countedQuantity).toBeNull();
    expect(res.body.data.items[0].discrepancy).toBeNull();
  });

  it('lets an employee create a draft', async () => {
    const { employeeToken, warehouseId } = await baseScenario('owner2@iv.test', 'IV Co 2');

    const res = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ warehouseId });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('restricts to explicit productIds when provided', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario('owner3@iv.test', 'IV Co 3');
    const secondProductId = await createProduct(ownerToken, 'SKU-SECOND-3');
    await createInventory(ownerToken, secondProductId, warehouseId, 50);

    const res = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId, productIds: [productId] });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productId).toBe(productId);
  });

  it('404s for a product with no stock record in that warehouse', async () => {
    const { ownerToken, warehouseId } = await baseScenario('owner4@iv.test', 'IV Co 4');
    const untrackedProductId = await createProduct(ownerToken, 'SKU-UNTRACKED-4');

    const res = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId, productIds: [untrackedProductId] });

    expect(res.status).toBe(404);
  });

  it('404s when the warehouse has no stock at all and productIds is omitted', async () => {
    const ownerToken = await registerCompany('owner5@iv.test', 'IV Co 5');
    const emptyWarehouseId = await createWarehouse(ownerToken, 'Empty');

    const res = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId: emptyWarehouseId });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/inventarizations/:id/count', () => {
  it('records counts and computes discrepancy', async () => {
    const { ownerToken, employeeToken, warehouseId, productId } = await baseScenario(
      'owner6@iv.test',
      'IV Co 6',
      100,
    );
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    const res = await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ counts: [{ productId, countedQuantity: 96 }] });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const item = res.body.data.items.find((i: { productId: string }) => i.productId === productId);
    expect(item.countedQuantity).toBe(96);
    expect(item.discrepancy).toBe(-4);
  });

  it('404s when the productId is not part of this inventarization', async () => {
    const { ownerToken, warehouseId } = await baseScenario('owner7@iv.test', 'IV Co 7');
    const outsideProductId = await createProduct(ownerToken, 'SKU-OUTSIDE-7');
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    const res = await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId: outsideProductId, countedQuantity: 5 }] });

    expect(res.status).toBe(404);
  });

  it('rejects recording counts on an already-completed inventarization', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario('owner8@iv.test', 'IV Co 8');
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 100 }] });
    await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 99 }] });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/inventarizations/:id/complete', () => {
  it('adjusts stock to match the count and logs a movement only for the discrepancy', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario(
      'owner9@iv.test',
      'IV Co 9',
      100,
    );
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 96 }] });

    const res = await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('completed');

    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(96);

    const movements = await request(app)
      .get(`/api/v1/stock-movements?type=inventarization`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(movements.body.data.items).toHaveLength(1);
    expect(movements.body.data.items[0].quantityDelta).toBe(-4);
    expect(movements.body.data.items[0].referenceId).toBe(created.body.data.id);
  });

  it('does not log a movement for an item with zero discrepancy', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario(
      'owner10@iv.test',
      'IV Co 10',
      50,
    );
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 50 }] });

    await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const movements = await request(app)
      .get('/api/v1/stock-movements?type=inventarization')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(movements.body.data.items).toHaveLength(0);
  });

  it('rejects completion while any item is still uncounted', async () => {
    const { ownerToken, warehouseId } = await baseScenario('owner11@iv.test', 'IV Co 11');
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    const res = await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
  });

  it('rejects completion by an employee (RBAC)', async () => {
    const { employeeToken, warehouseId, productId } = await baseScenario(
      'owner12@iv.test',
      'IV Co 12',
    );
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ counts: [{ productId, countedQuantity: 100 }] });

    const res = await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/inventarizations/:id/cancel', () => {
  it('cancels a draft without touching inventory', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario('owner13@iv.test', 'IV Co 13', 20);
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    const res = await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('cancelled');

    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(20);
  });

  it('rejects cancellation by an employee (RBAC)', async () => {
    const { employeeToken, warehouseId } = await baseScenario('owner14@iv.test', 'IV Co 14');
    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ warehouseId });

    const res = await request(app)
      .post(`/api/v1/inventarizations/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Multi-tenant isolation for inventarizations', () => {
  it('404s when fetching another company inventarization by id', async () => {
    const companyA = await baseScenario('ownerA@iv.test', 'IV Co A');
    const companyB = await baseScenario('ownerB@iv.test', 'IV Co B');

    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${companyA.ownerToken}`)
      .send({ warehouseId: companyA.warehouseId });

    const res = await request(app)
      .get(`/api/v1/inventarizations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${companyB.ownerToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Transactional completion (rollback on failure)', () => {
  it('rolls back the status flip AND every applied discrepancy if one item fails mid-way', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario(
      'owner15@iv.test',
      'IV Co 15',
      100,
    );
    const secondProductId = await createProduct(ownerToken, 'SKU-SECOND-15');
    await createInventory(ownerToken, secondProductId, warehouseId, 50);

    const created = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${created.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        counts: [
          { productId, countedQuantity: 90 },
          { productId: secondProductId, countedQuantity: 40 },
        ],
      });

    const original = inventoryRepository.adjustStock.bind(inventoryRepository);
    let callCount = 0;
    const spy = vi.spyOn(inventoryRepository, 'adjustStock').mockImplementation(async (...args) => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error('Simulated failure applying the second item');
      }
      return original(...args);
    });

    try {
      const res = await request(app)
        .post(`/api/v1/inventarizations/${created.body.data.id}/complete`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const stillDraft = await request(app)
      .get(`/api/v1/inventarizations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(stillDraft.body.data.status).toBe('draft');

    // The FIRST item's stock adjustment (which "succeeded" before the
    // second one threw) must have been rolled back too.
    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(100);

    const movements = await request(app)
      .get('/api/v1/stock-movements?type=inventarization')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(movements.body.data.items).toHaveLength(0);
  });
});

describe('GET /api/v1/inventarizations filtering', () => {
  it('filters by status', async () => {
    const { ownerToken, warehouseId, productId } = await baseScenario('owner16@iv.test', 'IV Co 16');

    const draft1 = await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });
    await request(app)
      .patch(`/api/v1/inventarizations/${draft1.body.data.id}/count`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ counts: [{ productId, countedQuantity: 100 }] });
    await request(app)
      .post(`/api/v1/inventarizations/${draft1.body.data.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);

    await request(app)
      .post('/api/v1/inventarizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ warehouseId });

    const completedOnly = await request(app)
      .get('/api/v1/inventarizations?status=completed')
      .set('Authorization', `Bearer ${ownerToken}`);
    const draftOnly = await request(app)
      .get('/api/v1/inventarizations?status=draft')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(completedOnly.body.data.items).toHaveLength(1);
    expect(draftOnly.body.data.items).toHaveLength(1);
  });
});
