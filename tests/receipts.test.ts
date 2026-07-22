import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { objectStorage } from '../src/utils/objectStorage.js';
import { anthropicClient } from '../src/utils/anthropicClient.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';
const FAKE_VIEW_URL = 'https://fake-bucket.example.test/signed-url?sig=abc';

let uploadSpy: ReturnType<typeof vi.spyOn>;
let presignSpy: ReturnType<typeof vi.spyOn>;
let presignUploadSpy: ReturnType<typeof vi.spyOn>;
let headObjectSpy: ReturnType<typeof vi.spyOn>;
let deleteSpy: ReturnType<typeof vi.spyOn>;
let downloadSpy: ReturnType<typeof vi.spyOn>;
let ocrSpy: ReturnType<typeof vi.spyOn>;
const FAKE_UPLOAD_URL = 'https://fake-bucket.example.test/signed-put-url?sig=xyz';

beforeEach(() => {
  uploadSpy = vi.spyOn(objectStorage, 'uploadObject').mockResolvedValue(undefined);
  presignSpy = vi
    .spyOn(objectStorage, 'getPresignedDownloadUrl')
    .mockResolvedValue(FAKE_VIEW_URL);
  presignUploadSpy = vi
    .spyOn(objectStorage, 'getPresignedUploadUrl')
    .mockResolvedValue(FAKE_UPLOAD_URL);
  // Individual tests override this per-case (it needs to know the size/type
  // of whatever the test "uploaded") - this default just avoids every test
  // needing to set it up when they don't care about the exact value.
  headObjectSpy = vi
    .spyOn(objectStorage, 'headObject')
    .mockResolvedValue({ size: 1024, contentType: 'image/jpeg' });
  deleteSpy = vi.spyOn(objectStorage, 'deleteObject').mockResolvedValue(undefined);
  downloadSpy = vi.spyOn(objectStorage, 'downloadObject').mockResolvedValue(Buffer.from('fake bytes'));
  ocrSpy = vi.spyOn(anthropicClient, 'askClaudeForJson').mockResolvedValue({
    amount: 42.5,
    date: '2026-01-15',
    category: 'Groceries',
    notes: 'Rema 1000',
  });
});

afterEach(() => {
  uploadSpy.mockRestore();
  presignSpy.mockRestore();
  presignUploadSpy.mockRestore();
  headObjectSpy.mockRestore();
  deleteSpy.mockRestore();
  downloadSpy.mockRestore();
  ocrSpy.mockRestore();
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

describe('POST /api/v1/receipts/:id/ocr', () => {
  it('extracts amount/date/category from a receipt photo', async () => {
    const { ownerToken } = await companyWithRoles('owner12@rc.test', 'RC Co 12');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .post(`/api/v1/receipts/${created.body.data.id}/ocr`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({
      amount: 42.5,
      date: '2026-01-15',
      category: 'Groceries',
      notes: 'Rema 1000',
    });
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(ocrSpy).toHaveBeenCalledTimes(1);
  });

  it('does not modify the receipt itself - read-only suggestion', async () => {
    const { ownerToken } = await companyWithRoles('owner13@rc.test', 'RC Co 13');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );
    expect(created.body.data.amount).toBeNull();

    await request(app)
      .post(`/api/v1/receipts/${created.body.data.id}/ocr`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const after = await request(app)
      .get(`/api/v1/receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(after.body.data.amount).toBeNull();
  });

  it('rejects OCR on a PDF receipt', async () => {
    const { ownerToken } = await companyWithRoles('owner14@rc.test', 'RC Co 14');
    const created = await request(app)
      .post('/api/v1/receipts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('type', 'expense')
      .attach('file', Buffer.from('%PDF-fake'), { filename: 'r.pdf', contentType: 'application/pdf' });

    const res = await request(app)
      .post(`/api/v1/receipts/${created.body.data.id}/ocr`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
    expect(ocrSpy).not.toHaveBeenCalled();
  });

  it('404s for a nonexistent receipt', async () => {
    const { ownerToken } = await companyWithRoles('owner15@rc.test', 'RC Co 15');

    const res = await request(app)
      .post('/api/v1/receipts/507f1f77bcf86cd799439011/ocr')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it('surfaces a clean error if Claude returns a malformed shape', async () => {
    ocrSpy.mockResolvedValue({ amount: 'not-a-number', date: null, category: null, notes: null });
    const { ownerToken } = await companyWithRoles('owner16@rc.test', 'RC Co 16');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .post(`/api/v1/receipts/${created.body.data.id}/ocr`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(422);
  });

  it('lets an employee run OCR too (same access as other AI features)', async () => {
    const { employeeToken } = await companyWithRoles('owner17@rc.test', 'RC Co 17');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${employeeToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .post(`/api/v1/receipts/${created.body.data.id}/ocr`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
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

  it('404s when running OCR on another company receipt', async () => {
    const companyA = await companyWithRoles('ownerA2@rc.test', 'RC Co A2');
    const companyB = await companyWithRoles('ownerB2@rc.test', 'RC Co B2');
    const created = await attachFakeImage(
      request(app)
        .post('/api/v1/receipts')
        .set('Authorization', `Bearer ${companyA.ownerToken}`)
        .field('type', 'expense'),
    );

    const res = await request(app)
      .post(`/api/v1/receipts/${created.body.data.id}/ocr`)
      .set('Authorization', `Bearer ${companyB.ownerToken}`);

    expect(res.status).toBe(404);
  });
});

async function registerCompanyWithId(email: string, companyName: string): Promise<{ token: string; companyId: string }> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    city: 'Stavanger',
    ownerName: 'Owner',
    email,
    password: strongPassword,
  });
  return {
    token: res.body.data.accessToken as string,
    companyId: res.body.data.user.companyId as string,
  };
}

describe('POST /api/v1/receipts/upload-url', () => {
  it('returns a signed upload URL and a fileKey scoped to the caller\'s own company', async () => {
    const { token, companyId } = await registerCompanyWithId('owner-up1@rc.test', 'RC Upload Co 1');

    const res = await request(app)
      .post('/api/v1/receipts/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'image/jpeg' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.uploadUrl).toBe(FAKE_UPLOAD_URL);
    expect(res.body.data.fileKey).toMatch(new RegExp(`^receipts/${companyId}/.+\\.jpg$`));
    expect(presignUploadSpy).toHaveBeenCalledWith(res.body.data.fileKey, 'image/jpeg');
  });

  it('rejects an unsupported mime type', async () => {
    const { token } = await registerCompanyWithId('owner-up2@rc.test', 'RC Upload Co 2');

    const res = await request(app)
      .post('/api/v1/receipts/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('is available to an employee (same broad access as the multipart upload endpoint)', async () => {
    const company = await companyWithRoles('owner-up3@rc.test', 'RC Upload Co 3');

    const res = await request(app)
      .post('/api/v1/receipts/upload-url')
      .set('Authorization', `Bearer ${company.employeeToken}`)
      .send({ mimeType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.data.fileKey).toMatch(/\.pdf$/);
  });
});

describe('POST /api/v1/receipts/confirm', () => {
  it('creates the receipt after verifying the object really exists at fileKey', async () => {
    const { token, companyId } = await registerCompanyWithId('owner-cf1@rc.test', 'RC Confirm Co 1');
    headObjectSpy.mockResolvedValueOnce({ size: 2048, contentType: 'image/png' });

    const res = await request(app)
      .post('/api/v1/receipts/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fileKey: `receipts/${companyId}/some-uuid.png`,
        type: 'expense',
        amount: 19.99,
        category: 'Supplies',
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.mimeType).toBe('image/png');
    expect(res.body.data.fileSize).toBe(2048);
    expect(res.body.data.amount).toBe(19.99);

    const list = await request(app).get('/api/v1/receipts').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.items).toHaveLength(1);
  });

  it('rejects when the file was never actually uploaded (headObject returns null)', async () => {
    const { token, companyId } = await registerCompanyWithId('owner-cf2@rc.test', 'RC Confirm Co 2');
    headObjectSpy.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/v1/receipts/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileKey: `receipts/${companyId}/never-uploaded.jpg`, type: 'expense' });

    expect(res.status).toBe(400);
  });

  it('rejects and cleans up an oversized upload', async () => {
    const { token, companyId } = await registerCompanyWithId('owner-cf3@rc.test', 'RC Confirm Co 3');
    headObjectSpy.mockResolvedValueOnce({ size: 11 * 1024 * 1024, contentType: 'image/jpeg' });

    const fileKey = `receipts/${companyId}/too-big.jpg`;
    const res = await request(app)
      .post('/api/v1/receipts/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileKey, type: 'expense' });

    expect(res.status).toBe(400);
    expect(deleteSpy).toHaveBeenCalledWith(fileKey);
  });

  it('rejects a fileKey that does not belong to the caller\'s own company (tenant isolation)', async () => {
    const { token: tokenA } = await registerCompanyWithId('owner-cf4a@rc.test', 'RC Confirm Co 4a');
    const { companyId: companyIdB } = await registerCompanyWithId('owner-cf4b@rc.test', 'RC Confirm Co 4b');

    const res = await request(app)
      .post('/api/v1/receipts/confirm')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ fileKey: `receipts/${companyIdB}/stolen-key.jpg`, type: 'expense' });

    expect(res.status).toBe(400);
    // Never even asks R2 about a key it already knows isn't this company's -
    // the prefix check happens before headObject is consulted at all.
    expect(headObjectSpy).not.toHaveBeenCalled();
  });
});
