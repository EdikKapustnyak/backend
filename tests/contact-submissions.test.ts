import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { platformAdminRepository } from '../src/modules/platform-admin/admin.repository.js';
import { hashPassword } from '../src/utils/password.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

async function createAdminAndLogin(email: string): Promise<string> {
  const passwordHash = await hashPassword(strongPassword);
  await platformAdminRepository.create({ email, passwordHash, name: 'Test Admin' });
  const login = await request(app).post('/api/v1/admin/auth/login').send({ email, password: strongPassword });
  return login.body.data.accessToken as string;
}

function validSubmission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Марат Хусаинов',
    company: '«Пилот Групп»',
    channel: 'whatsapp',
    contact: '+7 917 244-18-90',
    message: 'Интересует Business для 3 складов, хотим демо на этой неделе.',
    ...overrides,
  };
}

describe('POST /api/v1/contact', () => {
  it('accepts a valid submission and returns no data back', async () => {
    const res = await request(app).post('/api/v1/contact').send(validSubmission());

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toBeNull();
  });

  it('is public - no Authorization header required', async () => {
    const res = await request(app).post('/api/v1/contact').send(validSubmission({ name: 'Anonymous Visitor' }));
    expect(res.status).toBe(201);
  });

  it('rejects a missing required field', async () => {
    const res = await request(app).post('/api/v1/contact').send(validSubmission({ message: '' }));
    expect(res.status).toBe(422);
  });

  it('rejects an invalid channel', async () => {
    const res = await request(app).post('/api/v1/contact').send(validSubmission({ channel: 'carrier_pigeon' }));
    expect(res.status).toBe(422);
  });

  it('accepts a submission without a company (design shows "—" for this case)', async () => {
    const payload = validSubmission();
    delete (payload as { company?: string }).company;

    const res = await request(app).post('/api/v1/contact').send(payload);
    expect(res.status).toBe(201);
  });
});

describe('GET /api/v1/admin/contact-submissions', () => {
  it('requires admin authentication', async () => {
    await request(app).post('/api/v1/contact').send(validSubmission());
    const res = await request(app).get('/api/v1/admin/contact-submissions');
    expect(res.status).toBe(401);
  });

  it('lists submissions newest-first, defaulting new submissions to status "new"', async () => {
    const adminToken = await createAdminAndLogin('admin-leads1@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'First' }));
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'Second' }));

    const res = await request(app)
      .get('/api/v1/admin/contact-submissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].name).toBe('Second');
    expect(res.body.data.items[0].status).toBe('new');
    expect(res.body.data.pagination.totalItems).toBe(2);
  });

  it('filters by status', async () => {
    const adminToken = await createAdminAndLogin('admin-leads2@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'Still New' }));

    const res = await request(app)
      .get('/api/v1/admin/contact-submissions?status=done')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items).toHaveLength(0);
  });

  it('searches by name or company, case-insensitively', async () => {
    const adminToken = await createAdminAndLogin('admin-leads3@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'Ольга Ткаченко', company: 'FreshBox' }));
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'Denis Vogel', company: 'Baltic Parts' }));

    const res = await request(app)
      .get('/api/v1/admin/contact-submissions?search=freshbox')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].company).toBe('FreshBox');
  });
});

describe('GET /api/v1/admin/contact-submissions/open-count', () => {
  it('counts new and in-progress submissions but not done ones', async () => {
    const adminToken = await createAdminAndLogin('admin-leads4@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'A' }));
    await request(app).post('/api/v1/contact').send(validSubmission({ name: 'B' }));

    const listRes = await request(app)
      .get('/api/v1/admin/contact-submissions')
      .set('Authorization', `Bearer ${adminToken}`);
    const submissionA = listRes.body.data.items.find((s: { name: string }) => s.name === 'A');

    await request(app)
      .patch(`/api/v1/admin/contact-submissions/${submissionA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'done' });

    const res = await request(app)
      .get('/api/v1/admin/contact-submissions/open-count')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.count).toBe(1);
  });
});

describe('PATCH /api/v1/admin/contact-submissions/:id', () => {
  it('advances status and records an internal note', async () => {
    const adminToken = await createAdminAndLogin('admin-leads5@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission());

    const listRes = await request(app)
      .get('/api/v1/admin/contact-submissions')
      .set('Authorization', `Bearer ${adminToken}`);
    const id = listRes.body.data.items[0].id;

    const res = await request(app)
      .patch(`/api/v1/admin/contact-submissions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'progress', note: 'Созвон назначен на 21 июля' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('progress');
    expect(res.body.data.note).toBe('Созвон назначен на 21 июля');
  });

  it('requires admin authentication', async () => {
    await request(app).post('/api/v1/contact').send(validSubmission());
    const res = await request(app)
      .patch('/api/v1/admin/contact-submissions/507f1f77bcf86cd799439011')
      .send({ status: 'done' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent id', async () => {
    const adminToken = await createAdminAndLogin('admin-leads6@axisdigital.test');
    const res = await request(app)
      .patch('/api/v1/admin/contact-submissions/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'done' });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed id', async () => {
    const adminToken = await createAdminAndLogin('admin-leads7@axisdigital.test');
    const res = await request(app)
      .patch('/api/v1/admin/contact-submissions/not-an-object-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'done' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/admin/contact-submissions/:id/reply', () => {
  it('requires admin authentication', async () => {
    await request(app).post('/api/v1/contact').send(validSubmission());
    const res = await request(app)
      .post('/api/v1/admin/contact-submissions/507f1f77bcf86cd799439011/reply')
      .send({ message: 'Спасибо за интерес!' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent submission', async () => {
    const adminToken = await createAdminAndLogin('admin-reply1@axisdigital.test');
    const res = await request(app)
      .post('/api/v1/admin/contact-submissions/507f1f77bcf86cd799439011/reply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Спасибо за интерес!' });
    expect(res.status).toBe(404);
  });

  it('rejects an empty message', async () => {
    const adminToken = await createAdminAndLogin('admin-reply2@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission({ channel: 'email' }));

    const listRes = await request(app)
      .get('/api/v1/admin/contact-submissions')
      .set('Authorization', `Bearer ${adminToken}`);
    const id = listRes.body.data.items[0].id;

    const res = await request(app)
      .post(`/api/v1/admin/contact-submissions/${id}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: '' });
    expect(res.status).toBe(422);
  });

  it('refuses to reply by email to a whatsapp lead (no email address on file)', async () => {
    const adminToken = await createAdminAndLogin('admin-reply3@axisdigital.test');
    await request(app)
      .post('/api/v1/contact')
      .send(validSubmission({ channel: 'whatsapp', contact: '+7 900 123-45-67' }));

    const listRes = await request(app)
      .get('/api/v1/admin/contact-submissions')
      .set('Authorization', `Bearer ${adminToken}`);
    const lead = listRes.body.data.items.find((s: { channel: string }) => s.channel === 'whatsapp');

    const res = await request(app)
      .post(`/api/v1/admin/contact-submissions/${lead.id}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Спасибо за интерес!' });

    expect(res.status).toBe(400);
  });

  it('fails loudly (not silently) when email delivery is not configured, for an email-channel lead', async () => {
    // Mailer is deliberately blanked out in tests/setup.ts (RESEND_API_KEY='')
    // - unlike invite emails, which fall back to returning a link, there is
    // no reasonable fallback for "send this reply" if it can't actually send.
    const adminToken = await createAdminAndLogin('admin-reply4@axisdigital.test');
    await request(app).post('/api/v1/contact').send(validSubmission({ channel: 'email', contact: 'lead@example.test' }));

    const listRes = await request(app)
      .get('/api/v1/admin/contact-submissions')
      .set('Authorization', `Bearer ${adminToken}`);
    const lead = listRes.body.data.items.find((s: { channel: string }) => s.channel === 'email');

    const res = await request(app)
      .post(`/api/v1/admin/contact-submissions/${lead.id}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Спасибо за интерес! Ответим по существу в течение дня.' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not configured/i);
  });
});
