import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { writeOffRepository } from '../src/modules/write-offs/write-off.repository.js';

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

interface Scenario {
  ownerToken: string;
  employeeToken: string;
  productId: string;
  warehouseId: string;
}

async function baseScenario(
  email: string,
  companyName: string,
  initialQuantity = 50,
): Promise<Scenario> {
  const { token } = await registerCompany(email, companyName);
  const employeeToken = await inviteEmployee(token, `employee-${email}`);
  const productId = await createProduct(token, `SKU-${email}`);
  const warehouseId = await createWarehouse(token, 'Main');
  await createInventory(token, productId, warehouseId, initialQuantity);
  return { ownerToken: token, employeeToken, productId, warehouseId };
}

describe('POST /api/v1/write-offs (draft creation)', () => {
  it('lets an employee create a draft (no stock change yet)', async () => {
    const { employeeToken, productId, warehouseId, ownerToken } = await baseScenario(
      'owner1@wo.test',
      'WO Co 1',
      50,
    );

    const res = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 5, reason: 'damaged' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.confirmedAt).toBeNull();

    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(50); // unchanged - still just a draft
  });

  it('lets an owner create a draft too', async () => {
    const { ownerToken, productId, warehouseId } = await baseScenario('owner2@wo.test', 'WO Co 2');

    const res = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'lost' });

    expect(res.status).toBe(201);
  });

  it('404s when no stock record exists for the product+warehouse', async () => {
    const { token } = await registerCompany('owner3@wo.test', 'WO Co 3');
    const productId = await createProduct(token, 'SKU-3');
    const warehouseId = await createWarehouse(token, 'Main');
    // No POST /inventory call - no stock record exists yet.

    const res = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'expired' });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid reason', async () => {
    const { ownerToken, productId, warehouseId } = await baseScenario('owner4@wo.test', 'WO Co 4');

    const res = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'because_i_said_so' });

    expect(res.status).toBe(422);
  });

  it('404s when the product belongs to another company', async () => {
    const companyA = await baseScenario('ownerA@wo.test', 'WO Co A');
    const companyB = await baseScenario('ownerB@wo.test', 'WO Co B');

    const res = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${companyA.ownerToken}`)
      .send({
        productId: companyB.productId,
        warehouseId: companyA.warehouseId,
        quantity: 1,
        reason: 'damaged',
      });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/write-offs/:id/confirm', () => {
  it('decreases inventory and marks the write-off confirmed', async () => {
    const { employeeToken, ownerToken, productId, warehouseId } = await baseScenario(
      'owner5@wo.test',
      'WO Co 5',
      50,
    );

    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 8, reason: 'damaged' });

    const confirmed = await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('confirmed');
    expect(confirmed.body.data.confirmedAt).not.toBeNull();

    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(42);
  });

  it('rejects confirmation by an employee (RBAC)', async () => {
    const { employeeToken, productId, warehouseId } = await baseScenario(
      'owner6@wo.test',
      'WO Co 6',
    );

    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'damaged' });

    const res = await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('re-checks stock at confirm time, not at draft time', async () => {
    // Stock = 10. Draft A requests 8 (valid at draft time). Before A is
    // confirmed, draft B for 5 is created AND confirmed, dropping stock to
    // 5. Confirming A afterwards must now fail - only 5 left, not 8.
    const { ownerToken, employeeToken, productId, warehouseId } = await baseScenario(
      'owner7@wo.test',
      'WO Co 7',
      10,
    );

    const draftA = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 8, reason: 'damaged' });

    const draftB = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 5, reason: 'lost' });
    await request(app)
      .post(`/api/v1/write-offs/${draftB.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const confirmA = await request(app)
      .post(`/api/v1/write-offs/${draftA.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(confirmA.status).toBe(409);

    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(5); // only B's confirm applied
  });

  it('rejects confirming an already-confirmed write-off', async () => {
    const { ownerToken, employeeToken, productId, warehouseId } = await baseScenario(
      'owner8@wo.test',
      'WO Co 8',
    );
    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'damaged' });

    await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const secondConfirm = await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(secondConfirm.status).toBe(409);
  });
});

describe('POST /api/v1/write-offs/:id/cancel', () => {
  it('cancels a draft without touching inventory', async () => {
    const { ownerToken, employeeToken, productId, warehouseId } = await baseScenario(
      'owner9@wo.test',
      'WO Co 9',
      50,
    );
    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 10, reason: 'damaged' });

    const res = await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');

    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(50);
  });

  it('rejects cancellation by an employee (RBAC)', async () => {
    const { employeeToken, productId, warehouseId } = await baseScenario(
      'owner10@wo.test',
      'WO Co 10',
    );
    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'damaged' });

    const res = await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects cancelling an already-confirmed write-off', async () => {
    const { ownerToken, employeeToken, productId, warehouseId } = await baseScenario(
      'owner11@wo.test',
      'WO Co 11',
    );
    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 1, reason: 'damaged' });

    await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(409);
  });
});

describe('Multi-tenant isolation for write-offs', () => {
  it('404s when fetching another company write-off by id', async () => {
    const companyA = await baseScenario('ownerA2@wo.test', 'WO Co A2');
    const companyB = await baseScenario('ownerB2@wo.test', 'WO Co B2');

    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${companyA.ownerToken}`)
      .send({
        productId: companyA.productId,
        warehouseId: companyA.warehouseId,
        quantity: 1,
        reason: 'damaged',
      });

    const res = await request(app)
      .get(`/api/v1/write-offs/${draft.body.data.id}`)
      .set('Authorization', `Bearer ${companyB.ownerToken}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/write-offs filtering', () => {
  it('filters by status and reason', async () => {
    const { ownerToken, employeeToken, productId, warehouseId } = await baseScenario(
      'owner12@wo.test',
      'WO Co 12',
      50,
    );

    const draft1 = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 2, reason: 'damaged' });
    await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 3, reason: 'expired' });
    await request(app)
      .post(`/api/v1/write-offs/${draft1.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const confirmedOnly = await request(app)
      .get('/api/v1/write-offs?status=confirmed')
      .set('Authorization', `Bearer ${ownerToken}`);
    const expiredOnly = await request(app)
      .get('/api/v1/write-offs?reason=expired')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(confirmedOnly.body.data.items).toHaveLength(1);
    expect(confirmedOnly.body.data.items[0].reason).toBe('damaged');
    expect(expiredOnly.body.data.items).toHaveLength(1);
    expect(expiredOnly.body.data.items[0].status).toBe('draft');
  });
});

describe('Transactional confirmation (rollback on failure)', () => {
  it('rolls back the status flip AND the stock decrement if confirmation fails mid-way', async () => {
    const { ownerToken, employeeToken, productId, warehouseId } = await baseScenario(
      'owner13@wo.test',
      'WO Co 13',
      50,
    );

    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ productId, warehouseId, quantity: 10, reason: 'damaged' });

    const spy = vi
      .spyOn(writeOffRepository, 'confirmInCompany')
      .mockRejectedValueOnce(new Error('Simulated failure flipping status'));

    try {
      const res = await request(app)
        .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    // Stock must be unchanged - the decrement that ran before the
    // simulated failure must have been rolled back with it.
    const quantity = await getInventoryQuantity(ownerToken, productId, warehouseId);
    expect(quantity).toBe(50);

    // And the write-off must still be a draft, not stuck half-confirmed.
    const stillDraft = await request(app)
      .get(`/api/v1/write-offs/${draft.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(stillDraft.body.data.status).toBe('draft');

    // The StockMovement written just before the simulated failure must have
    // been rolled back too - it was part of the same transaction.
    const movements = await request(app)
      .get('/api/v1/stock-movements')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(movements.status, JSON.stringify(movements.body)).toBe(200);
    expect(movements.body.data.items).toHaveLength(0);
  });
});
