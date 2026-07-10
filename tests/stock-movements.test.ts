import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { stockMovementRepository } from '../src/modules/stock-movements/stock-movement.repository.js';

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
  productId: string;
  warehouseId: string;
  supplierId: string;
}

async function baseScenario(email: string, companyName: string): Promise<Scenario> {
  const { token } = await registerCompany(email, companyName);
  const productId = await createProduct(token, `SKU-${email}`);
  const warehouseId = await createWarehouse(token, 'Main');
  const supplierId = await createSupplier(token, 'Supplier Co');
  return { token, productId, warehouseId, supplierId };
}

describe('Stock movements are generated automatically', () => {
  it('records a "purchase" movement when a purchase is completed', async () => {
    const { token, productId, warehouseId, supplierId } = await baseScenario(
      'owner1@sm.test',
      'SM Co 1',
    );

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        warehouseId,
        items: [{ productId, quantity: 30, unitPrice: 12 }],
      });
    await request(app)
      .post(`/api/v1/purchases/${purchase.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const movements = await request(app)
      .get(`/api/v1/stock-movements?productId=${productId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(movements.status, JSON.stringify(movements.body)).toBe(200);
    expect(movements.body.data.items).toHaveLength(1);
    const movement = movements.body.data.items[0];
    expect(movement.type).toBe('purchase');
    expect(movement.quantityDelta).toBe(30);
    expect(movement.quantityAfter).toBe(30);
    expect(movement.referenceType).toBe('purchase');
    expect(movement.referenceId).toBe(purchase.body.data.id);
  });

  it('records one movement per line item for a multi-item purchase', async () => {
    const { token, productId, warehouseId, supplierId } = await baseScenario(
      'owner2@sm.test',
      'SM Co 2',
    );
    const secondProduct = await createProduct(token, 'SKU-SECOND-2');

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        warehouseId,
        items: [
          { productId, quantity: 10, unitPrice: 5 },
          { productId: secondProduct, quantity: 20, unitPrice: 5 },
        ],
      });
    await request(app)
      .post(`/api/v1/purchases/${purchase.body.data.id}/complete`)
      .set('Authorization', `Bearer ${token}`);

    const movements = await request(app)
      .get(`/api/v1/stock-movements?type=purchase`)
      .set('Authorization', `Bearer ${token}`);

    expect(movements.status, JSON.stringify(movements.body)).toBe(200);
    expect(movements.body.data.items).toHaveLength(2);
  });

  it('records a "write_off" movement when a write-off is confirmed', async () => {
    const { token, productId, warehouseId } = await baseScenario('owner3@sm.test', 'SM Co 3');

    await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 50 });

    const draft = await request(app)
      .post('/api/v1/write-offs')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 7, reason: 'damaged' });
    await request(app)
      .post(`/api/v1/write-offs/${draft.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);

    const movements = await request(app)
      .get(`/api/v1/stock-movements?type=write_off`)
      .set('Authorization', `Bearer ${token}`);

    expect(movements.status, JSON.stringify(movements.body)).toBe(200);
    expect(movements.body.data.items).toHaveLength(1);
    const movement = movements.body.data.items[0];
    expect(movement.quantityDelta).toBe(-7);
    expect(movement.quantityAfter).toBe(43);
    expect(movement.referenceType).toBe('write_off');
    expect(movement.referenceId).toBe(draft.body.data.id);
  });

  it('records a "manual_adjustment" movement when quantity is adjusted directly', async () => {
    const { token, productId, warehouseId } = await baseScenario('owner4@sm.test', 'SM Co 4');
    const inventory = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 20 });

    await request(app)
      .patch(`/api/v1/inventory/${inventory.body.data.id}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantityDelta: 15 });

    const movements = await request(app)
      .get(`/api/v1/stock-movements?type=manual_adjustment`)
      .set('Authorization', `Bearer ${token}`);

    expect(movements.status, JSON.stringify(movements.body)).toBe(200);
    expect(movements.body.data.items).toHaveLength(1);
    expect(movements.body.data.items[0].quantityDelta).toBe(15);
    expect(movements.body.data.items[0].quantityAfter).toBe(35);
    expect(movements.body.data.items[0].referenceType).toBeNull();
  });

  it('does NOT record a movement for a reservation-only adjustment', async () => {
    const { token, productId, warehouseId } = await baseScenario('owner5@sm.test', 'SM Co 5');
    const inventory = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 20 });

    await request(app)
      .patch(`/api/v1/inventory/${inventory.body.data.id}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reservedDelta: 5 });

    const movements = await request(app)
      .get('/api/v1/stock-movements')
      .set('Authorization', `Bearer ${token}`);

    expect(movements.status, JSON.stringify(movements.body)).toBe(200);
    expect(movements.body.data.items).toHaveLength(0);
  });
});

describe('GET /api/v1/stock-movements is read-only', () => {
  it('has no POST route', async () => {
    const { token } = await registerCompany('owner6@sm.test', 'SM Co 6');

    const res = await request(app)
      .post('/api/v1/stock-movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantityDelta: 100 });

    expect(res.status).toBe(404);
  });
});

describe('Multi-tenant isolation for stock movements', () => {
  it('404s when fetching another company movement by id', async () => {
    const companyA = await baseScenario('ownerA@sm.test', 'SM Co A');
    const companyB = await baseScenario('ownerB@sm.test', 'SM Co B');

    const inventory = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ productId: companyA.productId, warehouseId: companyA.warehouseId, quantity: 10 });
    await request(app)
      .patch(`/api/v1/inventory/${inventory.body.data.id}/adjust`)
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ quantityDelta: 5 });

    const listA = await request(app)
      .get('/api/v1/stock-movements')
      .set('Authorization', `Bearer ${companyA.token}`);
    expect(listA.status, JSON.stringify(listA.body)).toBe(200);
    const movementId = listA.body.data.items[0].id as string;

    const res = await request(app)
      .get(`/api/v1/stock-movements/${movementId}`)
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(res.status).toBe(404);
  });

  it('does not include another company movements in the list', async () => {
    const companyA = await baseScenario('ownerA2@sm.test', 'SM Co A2');
    const companyB = await baseScenario('ownerB2@sm.test', 'SM Co B2');

    const inventoryA = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ productId: companyA.productId, warehouseId: companyA.warehouseId, quantity: 10 });
    await request(app)
      .patch(`/api/v1/inventory/${inventoryA.body.data.id}/adjust`)
      .set('Authorization', `Bearer ${companyA.token}`)
      .send({ quantityDelta: 1 });

    const listB = await request(app)
      .get('/api/v1/stock-movements')
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(listB.status, JSON.stringify(listB.body)).toBe(200);
    expect(listB.body.data.items).toHaveLength(0);
  });
});

describe('Transactional manual adjustment (rollback on failure)', () => {
  it('rolls back the quantity change if writing the movement record fails', async () => {
    const { token, productId, warehouseId } = await baseScenario('owner7@sm.test', 'SM Co 7');
    const inventory = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, warehouseId, quantity: 20 });

    const spy = vi
      .spyOn(stockMovementRepository, 'create')
      .mockRejectedValueOnce(new Error('Simulated failure writing the movement record'));

    try {
      const res = await request(app)
        .patch(`/api/v1/inventory/${inventory.body.data.id}/adjust`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantityDelta: 10 });

      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    // The quantity increment must have been rolled back along with the
    // failed movement write - without a real transaction this would be 30.
    const check = await request(app)
      .get(`/api/v1/inventory/${inventory.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(check.body.data.quantity).toBe(20);
  });
});
