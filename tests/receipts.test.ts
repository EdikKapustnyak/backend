import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { objectStorage } from '../src/utils/objectStorage.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';
const FAKE_VIEW_URL = 'https://fake-bucket.example.test/signed-url?sig=abc';

let uploadSpy: ReturnType<typeof vi.spyOn>;
let presignSpy: ReturnType<typeof vi.spyOn>;
let deleteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  uploadSpy = vi.spyOn(objectStorage, 'uploadObject').mockResolvedValue(undefined);
  presignSpy = vi
    .spyOn(objectStorage, 'getPresignedDownloadUrl')
    .mockResolvedValue(FAKE_VIEW_URL);
  deleteSpy = vi.spyOn(objectStorage, 'deleteObject').mockResolvedValue(undefined);
});

afterEach(() => {
  uploadSpy.mockRestore();
  presignSpy.mockRestore();
  deleteSpy.mockRestore();
});

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
  await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Employee', email, password: strongPassword, role: 'employee' });

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: strongPassword });
  return login.body.data.accessToken as string;
}

async function companyWithRoles(email: string, companyName: string): Promise<Company> {
  const ownerToken = await registerCompany(email, companyName);
  const employeeToken = await inviteEmployee(ownerToken, `employee-${email}`);
  return { ownerToken, employeeToken };
}

function attachFakeImage(req: request.Test): request.Test {
  return req.attach('file', Buffer.from('fake jpeg bytes'), {
    filename: 'receipt.jpg',
    contentType: 'image/jpeg',
  });
}

describe('POST /api/v1/receipts', () => {
  it('uploads a receipt and returns metadata with a presigned view URL', async () => {
    const { ownerToken } = await companyWithRoles('owner1@rc.test', 'RC Co 1');

    const res = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'daily_revenue')
        .field('amount', '1500.5')
        .field('date', '2026-01-15'),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.type).toBe('daily_revenue');
    expect(res.body.data.amount).toBe(1500.5);
    expect(res.body.data.viewUrl).toBe(FAKE_VIEW_URL);
    expect(res.body.data.mimeType).toBe('image/jpeg');
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  it('lets an employee upload a receipt', async () => {
    const { employeeToken } = await companyWithRoles('owner2@rc.test', 'RC Co 2');

    const res = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .field('type', 'purchase'),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('defaults the date to now when omitted', async () => {
    const { ownerToken } = await companyWithRoles('owner3@rc.test', 'RC Co 3');

    const res = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.date).not.toBeNull();
  });

  it('rejects when no file is attached', async () => {
    const { ownerToken } = await companyWithRoles('owner4@rc.test', 'RC Co 4');

    const res = await request(app)
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('type', 'daily_revenue');

    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type', async () => {
    const { ownerToken } = await companyWithRoles('owner5@rc.test', 'RC Co 5');

    const res = await request(app)
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('type', 'daily_revenue')
      .attach('file', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid receipt type value', async () => {
    const { ownerToken } = await companyWithRoles('owner6@rc.test', 'RC Co 6');

    const res = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'not_a_real_type'),
    );

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/receipts', () => {
  it('lists receipts with a fresh view URL and filters by type', async () => {
    const { ownerToken } = await companyWithRoles('owner7@rc.test', 'RC Co 7');
    await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'daily_revenue'),
    );
    await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'purchase'),
    );

    const res = await request(app)
      .get('/api/v1/receipts?type=purchase')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].type).toBe('purchase');
    expect(res.body.data.items[0].viewUrl).toBe(FAKE_VIEW_URL);
  });

  it('excludes soft-deleted receipts by default', async () => {
    const { ownerToken } = await companyWithRoles('owner8@rc.test', 'RC Co 8');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );
    await request(app)
      .delete(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get('/api/v1/receipts')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.body.data.items).toHaveLength(0);
  });
});

describe('PATCH /api/v1/receipts/:id', () => {
  it('updates metadata', async () => {
    const { ownerToken } = await companyWithRoles('owner9@rc.test', 'RC Co 9');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense')
        .field('category', 'аренда'),
    );

    const res = await request(app)
      .patch(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ category: 'коммуналка', amount: 250 });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.category).toBe('коммуналка');
    expect(res.body.data.amount).toBe(250);
  });

  it('rejects update by an employee (RBAC)', async () => {
    const { ownerToken, employeeToken } = await companyWithRoles('owner10@rc.test', 'RC Co 10');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .patch(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ category: 'x' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/receipts/:id', () => {
  it('soft-deletes without deleting the underlying file', async () => {
    const { ownerToken } = await companyWithRoles('owner11@rc.test', 'RC Co 11');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .delete(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('rejects deactivating an already-inactive receipt', async () => {
    const { ownerToken } = await companyWithRoles('owner12@rc.test', 'RC Co 12');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );
    await request(app)
      .delete(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .delete(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(409);
  });

  it('rejects deletion by an employee (RBAC)', async () => {
    const { ownerToken, employeeToken } = await companyWithRoles('owner13@rc.test', 'RC Co 13');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .delete(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Multi-tenant isolation for receipts', () => {
  it('404s when fetching another company receipt by id', async () => {
    const companyA = await companyWithRoles('ownerA@rc.test', 'RC Co A');
    const companyB = await companyWithRoles('ownerB@rc.test', 'RC Co B');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${companyA.ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .get(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${companyB.ownerToken}`);

    expect(res.status).toBe(404);
  });
});
