import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { platformAdminRepository } from '../src/modules/platform-admin/admin.repository.js';
import { hashPassword } from '../src/utils/password.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

/**
 * There is no public registration endpoint for PlatformAdmin (see
 * admin.model.ts's doc comment) - the only way one gets created is
 * scripts/create-platform-admin.ts or, here, calling the repository
 * directly the same way that script does.
 */
async function createAdmin(email: string, overrides: { isActive?: boolean } = {}) {
  const passwordHash = await hashPassword(strongPassword);
  const admin = await platformAdminRepository.create({ email, passwordHash, name: 'Test Admin' });
  if (overrides.isActive === false) {
    admin.isActive = false;
    await admin.save();
  }
  return admin;
}

function extractAdminRefreshCookie(res: request.Response): string {
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith('adminRefreshToken='));
  if (!cookie) throw new Error('No adminRefreshToken cookie in response - test setup is broken');
  return cookie.split(';')[0] as string;
}

describe('POST /api/v1/admin/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await createAdmin('admin1@axisdigital.test');

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin1@axisdigital.test', password: strongPassword });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.admin.email).toBe('admin1@axisdigital.test');
    expect(res.body.data.admin).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect password without leaking which field was wrong', async () => {
    await createAdmin('admin2@axisdigital.test');

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin2@axisdigital.test', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects a non-existent email with the same generic message', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'nobody@axisdigital.test', password: strongPassword });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects a deactivated admin even with the correct password', async () => {
    await createAdmin('admin3@axisdigital.test', { isActive: false });

    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin3@axisdigital.test', password: strongPassword });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/auth/me', () => {
  it('rejects requests without an access token', async () => {
    const res = await request(app).get('/api/v1/admin/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current admin for a valid token', async () => {
    await createAdmin('admin4@axisdigital.test');
    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin4@axisdigital.test', password: strongPassword });

    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('admin4@axisdigital.test');
  });
});

describe('POST /api/v1/admin/auth/refresh', () => {
  it('rotates the refresh token and returns a new access token', async () => {
    await createAdmin('admin5@axisdigital.test');
    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin5@axisdigital.test', password: strongPassword });
    const cookie = extractAdminRefreshCookie(login);

    const res = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', cookie);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.headers['set-cookie']?.[0]).toMatch(/adminRefreshToken=/);
  });

  it('rejects a missing refresh token', async () => {
    const res = await request(app).post('/api/v1/admin/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects reuse of an old refresh token after it has been rotated', async () => {
    await createAdmin('admin6@axisdigital.test');
    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin6@axisdigital.test', password: strongPassword });
    const oldCookie = extractAdminRefreshCookie(login);

    await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', oldCookie);
    const reuse = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', oldCookie);

    expect(reuse.status).toBe(401);
  });
});

describe('POST /api/v1/admin/auth/logout', () => {
  it('revokes the session - the refresh cookie no longer works afterward', async () => {
    await createAdmin('admin7@axisdigital.test');
    const login = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin7@axisdigital.test', password: strongPassword });
    const cookie = extractAdminRefreshCookie(login);

    const logout = await request(app)
      .post('/api/v1/admin/auth/logout')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(logout.status).toBe(200);

    const refreshAfterLogout = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });
});

describe('Isolation from the tenant auth system', () => {
  it('a tenant user\'s access token is rejected by an admin-only route', async () => {
    const tenantRegister = await request(app).post('/api/v1/auth/register-company').send({
      companyName: 'Acme Coffee',
      ownerName: 'Alice Owner',
      email: 'alice-iso@acme.test',
      password: strongPassword,
      city: 'Stavanger',
    });
    const tenantAccessToken = tenantRegister.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${tenantAccessToken}`);

    // Signed with JWT_ACCESS_SECRET, not ADMIN_JWT_ACCESS_SECRET - verification
    // must fail outright, not merely "work but see the wrong account".
    expect(res.status).toBe(401);
  });

  it('a platform admin\'s access token is rejected by a tenant-only route', async () => {
    await createAdmin('admin8@axisdigital.test');
    const adminLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin8@axisdigital.test', password: strongPassword });
    const adminAccessToken = adminLogin.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminAccessToken}`);

    expect(res.status).toBe(401);
  });

  it('the two refresh cookies never collide - each system only reads its own cookie name', async () => {
    await createAdmin('admin9@axisdigital.test');
    const adminLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin9@axisdigital.test', password: strongPassword });
    const adminCookie = extractAdminRefreshCookie(adminLogin);

    // Sending the admin's refresh cookie to the *tenant* refresh endpoint
    // must not be accepted as a tenant refresh token under any name collision.
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', adminCookie);
    expect(res.status).toBe(401);
  });
});
