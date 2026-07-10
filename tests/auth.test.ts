import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

const strongPassword = 'Sup3rSecret!';

function registerCompanyPayload(overrides: Partial<Record<string, string>> = {}) {
  return {
    companyName: 'Acme Coffee',
    ownerName: 'Alice Owner',
    email: 'alice@acme.test',
    password: strongPassword,
    ...overrides,
  };
}

describe('POST /api/v1/auth/register-company', () => {
  it('creates a company and an OWNER user, returns an access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('owner');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/v1/auth/register-company').send(registerCompanyPayload());

    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ companyName: 'Another Co' }));

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ password: 'weak' }));

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await request(app).post('/api/v1/auth/register-company').send(registerCompanyPayload());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.test', password: strongPassword });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects incorrect password without leaking which field was wrong', async () => {
    await request(app).post('/api/v1/auth/register-company').send(registerCompanyPayload());

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.test', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });
});

describe('Multi-tenant isolation', () => {
  it('does not allow a user from company A to see users of company B', async () => {
    const companyA = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'owner-a@acme.test', companyName: 'Company A' }));

    const companyB = await request(app).post('/api/v1/auth/register-company').send(
      registerCompanyPayload({
        email: 'owner-b@acme.test',
        companyName: 'Company B',
      }),
    );

    const tokenA = companyA.body.data.accessToken as string;
    const tokenB = companyB.body.data.accessToken as string;

    const listAsA = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`);

    const listAsB = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(listAsA.status).toBe(200);
    expect(listAsB.status).toBe(200);

    const emailsInA = listAsA.body.data.map((u: { email: string }) => u.email);
    const emailsInB = listAsB.body.data.map((u: { email: string }) => u.email);

    expect(emailsInA).toContain('owner-a@acme.test');
    expect(emailsInA).not.toContain('owner-b@acme.test');
    expect(emailsInB).toContain('owner-b@acme.test');
    expect(emailsInB).not.toContain('owner-a@acme.test');
  });
});

describe('RBAC', () => {
  it('prevents a non-owner/admin from inviting new users', async () => {
    const owner = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload());
    const ownerToken = owner.body.data.accessToken as string;

    const inviteRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Bob Employee',
        email: 'bob@acme.test',
        password: strongPassword,
        role: 'employee',
      });
    expect(inviteRes.status).toBe(201);

    const employeeLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bob@acme.test', password: strongPassword });
    const employeeToken = employeeLogin.body.data.accessToken as string;

    const forbiddenInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Carol',
        email: 'carol@acme.test',
        password: strongPassword,
        role: 'employee',
      });

    expect(forbiddenInvite.status).toBe(403);
    expect(forbiddenInvite.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('rejects requests without an access token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
