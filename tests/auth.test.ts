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
    city: 'Stavanger',
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

  it('rejects registration without a city', async () => {
    const payload = registerCompanyPayload();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (payload as any).city;

    const res = await request(app).post('/api/v1/auth/register-company').send(payload);

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
        role: 'employee',
      });
    expect(inviteRes.status).toBe(201);

    // Mailer isn't configured in the test environment (see tests/setup.ts),
    // so the invite link comes back in the response instead of being
    // emailed - extract the token from it the same way a frontend would
    // parse it from the accept-invite URL.
    const inviteLink = inviteRes.body.data.inviteLink as string;
    const token = new URL(inviteLink).searchParams.get('token');

    const accept = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: strongPassword });
    expect(accept.status).toBe(200);
    const employeeToken = accept.body.data.accessToken as string;

    const forbiddenInvite = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Carol',
        email: 'carol@acme.test',
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

function extractRefreshCookie(res: request.Response): string {
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith('refreshToken='));
  if (!cookie) throw new Error('No refreshToken cookie in response - test setup is broken');
  return cookie.split(';')[0] as string;
}

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and returns a new access token', async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'refresh1@acme.test' }));
    const cookie = extractRefreshCookie(registerRes);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('rejects a missing refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects reuse of an old refresh token after it has been rotated', async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'refresh2@acme.test' }));
    const oldCookie = extractRefreshCookie(registerRes);

    await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);

    expect(reuse.status).toBe(401);
  });
});

describe('Multi-device sessions', () => {
  it('creates a separate, independently-listed session per login', async () => {
    await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'multi1@acme.test' }));
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'multi1@acme.test', password: strongPassword });
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'multi1@acme.test', password: strongPassword });

    const res = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${login1.body.data.accessToken as string}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // registration + 2 logins = 3 sessions total
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.filter((s: { isCurrent: boolean }) => s.isCurrent)).toHaveLength(1);
  });

  it('logout ends only the current session - other devices stay signed in', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'logout1@acme.test' }));
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'logout1@acme.test', password: strongPassword });

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);

    const stillWorks = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login2.body.data.accessToken as string}`);
    expect(stillWorks.status).toBe(200);
  });

  it('revokes one specific session by id, leaving others untouched', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'revoke1@acme.test' }));
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'revoke1@acme.test', password: strongPassword });

    const list = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);
    const otherSession = list.body.data.find((s: { isCurrent: boolean }) => !s.isCurrent);

    const revokeRes = await request(app)
      .delete(`/api/v1/auth/sessions/${otherSession.id as string}`)
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);
    expect(revokeRes.status, JSON.stringify(revokeRes.body)).toBe(200);

    // The revoked session's refresh token must no longer work.
    const login2Cookie = extractRefreshCookie(login2);
    const refreshAttempt = await request(app).post('/api/v1/auth/refresh').set('Cookie', login2Cookie);
    expect(refreshAttempt.status).toBe(401);
  });

  it('rejects revoking a session that does not exist', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'revoke2@acme.test' }));

    const res = await request(app)
      .delete('/api/v1/auth/sessions/000000000000000000000000')
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);

    expect(res.status).toBe(404);
  });

  it('DELETE /auth/sessions logs out of every device at once', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register-company')
      .send(registerCompanyPayload({ email: 'logoutall@acme.test' }));
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'logoutall@acme.test', password: strongPassword });

    const res = await request(app)
      .delete('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const registerCookie = extractRefreshCookie(register);
    const refreshAttempt = await request(app).post('/api/v1/auth/refresh').set('Cookie', registerCookie);
    expect(refreshAttempt.status).toBe(401);
  });
});
