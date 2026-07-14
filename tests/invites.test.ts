import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InviteModel } from '../src/modules/users/invite.model.js';

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

async function registerOwner(overrides: Partial<Record<string, string>> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register-company')
    .send(registerCompanyPayload(overrides));
  return res.body.data.accessToken as string;
}

/** Invites an employee and extracts the raw token from the fallback link (mailer is unconfigured in tests). */
async function inviteAndGetToken(ownerToken: string, email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Bob Employee', email, role: 'employee' });

  const link = res.body.data.inviteLink as string;
  return new URL(link).searchParams.get('token') as string;
}

describe('POST /api/v1/users (invite)', () => {
  it('creates a pending user (passwordSet: false) and returns an invite link since mail is unconfigured', async () => {
    const ownerToken = await registerOwner();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bob Employee', email: 'bob@acme.test', role: 'employee' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.passwordSet).toBe(false);
    expect(res.body.data.inviteLink).toEqual(expect.stringContaining('/accept-invite?token='));
    expect(res.body.message).toMatch(/email delivery is not configured/i);
  });

  it('ignores a password field in the request body (schema no longer accepts one)', async () => {
    const ownerToken = await registerOwner();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bob', email: 'bob2@acme.test', role: 'employee', password: 'whatever-this-is-ignored' });

    expect(res.status).toBe(201);
  });

  it('rejects inviting an email that is already registered', async () => {
    const ownerToken = await registerOwner();
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bob', email: 'dup@acme.test', role: 'employee' });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bob Two', email: 'dup@acme.test', role: 'employee' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/auth/accept-invite', () => {
  it('lets the invited user choose a password and signs them in immediately', async () => {
    const ownerToken = await registerOwner();
    const token = await inviteAndGetToken(ownerToken, 'carol@acme.test');

    const accept = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: strongPassword });

    expect(accept.status).toBe(200);
    expect(accept.body.data.user.passwordSet).toBe(true);
    expect(accept.body.data.accessToken).toEqual(expect.any(String));
    expect(accept.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('lets the user log in normally afterward with their chosen password', async () => {
    const ownerToken = await registerOwner();
    const token = await inviteAndGetToken(ownerToken, 'dave@acme.test');
    await request(app).post('/api/v1/auth/accept-invite').send({ token, password: strongPassword });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dave@acme.test', password: strongPassword });

    expect(login.status).toBe(200);
  });

  it('rejects login before the invite has been accepted (same generic message as wrong password)', async () => {
    const ownerToken = await registerOwner();
    await inviteAndGetToken(ownerToken, 'erin@acme.test');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'erin@acme.test', password: 'SomeGuess1' });

    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('UNAUTHORIZED');
    expect(login.body.error.message).toBe('Invalid email or password');
  });

  it('rejects an invalid/garbage token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: 'not-a-real-token', password: strongPassword });

    expect(res.status).toBe(401);
  });

  it('rejects reusing an already-accepted invite token (single use)', async () => {
    const ownerToken = await registerOwner();
    const token = await inviteAndGetToken(ownerToken, 'frank@acme.test');

    const first = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: strongPassword });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: 'AnotherPass1' });
    expect(second.status).toBe(401);
  });

  it('rejects an expired invite token', async () => {
    const ownerToken = await registerOwner();
    const token = await inviteAndGetToken(ownerToken, 'grace@acme.test');

    // The only test in this file that reaches into the model layer directly -
    // needed to push the invite's expiresAt into the past without actually
    // waiting the real 7-day TTL out, to exercise that boundary specifically.
    await InviteModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
      .setOptions({ skipTenantScope: true })
      .exec();

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: strongPassword });

    expect(res.status).toBe(401);
  });

  it('rejects a weak password on accept (same complexity rule as registration)', async () => {
    const ownerToken = await registerOwner();
    const token = await inviteAndGetToken(ownerToken, 'henry@acme.test');

    const res = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: 'weak' });

    expect(res.status).toBe(422);
  });
});
