import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as mailerModule from '../src/utils/mailer.js';

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

/**
 * Invites and accepts in one step. Forces isMailerConfigured() to false
 * just for this call (queued via mockReturnValueOnce) so the invite flow
 * takes its own "mailer not configured -> return the link in the
 * response" fallback, regardless of the outer `true` mock in this
 * describe block - that outer mock is for the notification emails under
 * test here, not the unrelated invite-email path, and the two would
 * otherwise collide since both read the same isMailerConfigured().
 */
async function inviteAndAccept(ownerToken: string, email: string, role: string): Promise<string> {
  isConfiguredSpy.mockReturnValueOnce(false);
  const invite = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: role, email, role });
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
  return res.body.data.id as string;
}

let sendMailSpy: ReturnType<typeof vi.spyOn>;
let isConfiguredSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('notification emails (mailer configured)', () => {
  beforeEach(() => {
    isConfiguredSpy = vi.spyOn(mailerModule, 'isMailerConfigured').mockReturnValue(true);
    sendMailSpy = vi.spyOn(mailerModule.mailer, 'sendMail').mockResolvedValue(undefined);
  });

  it('emails owner and admin, but not employee, when a low-stock notification newly opens', async () => {
    const ownerToken = await registerCompany('owner1@ntmail.test', 'NT Mail Co 1');
    await inviteAndAccept(ownerToken, 'admin1@ntmail.test', 'admin');
    await inviteAndAccept(ownerToken, 'employee1@ntmail.test', 'employee');

    const productId = await createProduct(ownerToken, 'SKU-M1', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 15); // below threshold

    await vi.waitFor(() => expect(sendMailSpy).toHaveBeenCalled(), { timeout: 2000 });

    const recipients = sendMailSpy.mock.calls.map((call) => (call[0] as { to: string }).to);
    expect(recipients).toContain('owner1@ntmail.test');
    expect(recipients).toContain('admin1@ntmail.test');
    expect(recipients).not.toContain('employee1@ntmail.test');
    expect(sendMailSpy.mock.calls[0]?.[0]).toMatchObject({ subject: expect.stringContaining('Low stock') });
  });

  it('does not re-send an email on repeated low-stock triggers while still below threshold', async () => {
    const ownerToken = await registerCompany('owner2@ntmail.test', 'NT Mail Co 2');
    const productId = await createProduct(ownerToken, 'SKU-M2', 10);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    const inventoryId = await createInventory(ownerToken, productId, warehouseId, 50);

    await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantityDelta: -45 }); // 5 left, below 10 - newly opens
    await vi.waitFor(() => expect(sendMailSpy).toHaveBeenCalledTimes(1), { timeout: 2000 });

    await request(app)
      .patch(`/api/v1/inventory/${inventoryId}/adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantityDelta: -2 }); // 3 left, still below 10 - refresh only

    // Give any (incorrect) second send a moment to happen before asserting
    // it didn't.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
  });

  it('emails admins for a large inventarization discrepancy', async () => {
    const ownerToken = await registerCompany('owner3@ntmail.test', 'NT Mail Co 3');
    const productId = await createProduct(ownerToken, 'SKU-M3', 5);
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

    await vi.waitFor(() => {
      const subjects = sendMailSpy.mock.calls.map((call) => (call[0] as { subject: string }).subject);
      expect(subjects.some((s) => s.includes('Large discrepancy'))).toBe(true);
    }, { timeout: 2000 });
  });

  it('does not throw or block the request if the mailer rejects the send', async () => {
    sendMailSpy.mockRejectedValue(new Error('Resend is down'));
    const ownerToken = await registerCompany('owner4@ntmail.test', 'NT Mail Co 4');
    const productId = await createProduct(ownerToken, 'SKU-M4', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');

    const res = await request(app)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId, warehouseId, quantity: 15 });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await vi.waitFor(() => expect(sendMailSpy).toHaveBeenCalled(), { timeout: 2000 });
  });
});

describe('notification emails (mailer not configured - default test environment)', () => {
  it('skips emailing silently and still creates the in-app notification', async () => {
    isConfiguredSpy = vi.spyOn(mailerModule, 'isMailerConfigured').mockReturnValue(false);
    sendMailSpy = vi.spyOn(mailerModule.mailer, 'sendMail');

    const ownerToken = await registerCompany('owner5@ntmail.test', 'NT Mail Co 5');
    const productId = await createProduct(ownerToken, 'SKU-M5', 20);
    const warehouseId = await createWarehouse(ownerToken, 'Main');
    await createInventory(ownerToken, productId, warehouseId, 15);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.body.data.items).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(isConfiguredSpy).toHaveBeenCalled();
  });
});
