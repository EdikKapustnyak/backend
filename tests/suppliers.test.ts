import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

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

function supplierPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Coffee Supplier AS',
    contactPerson: 'Jonas Berg',
    phone: '+47 123 45 678',
    email: 'contact@coffeesupplier.test',
    address: 'Industrivegen 1, Stavanger',
    ...overrides,
  };
}

describe('POST /api/v1/suppliers', () => {
  it('creates a supplier for the caller company (owner)', async () => {
    const { token } = await registerCompany('owner1@sup.test', 'Supplier Co 1');

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Coffee Supplier AS');
    expect(res.body.data.isActive).toBe(true);
  });

  it('rejects creation by an employee (RBAC)', async () => {
    const { token } = await registerCompany('owner2@sup.test', 'Supplier Co 2');
    const employeeToken = await inviteEmployee(token, 'employee2@sup.test');

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(supplierPayload());

    expect(res.status).toBe(403);
  });

  it('rejects an invalid email format', async () => {
    const { token } = await registerCompany('owner3@sup.test', 'Supplier Co 3');

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload({ email: 'not-an-email' }));

    expect(res.status).toBe(422);
  });

  it('rejects a duplicate supplier name within the same company', async () => {
    const { token } = await registerCompany('owner4@sup.test', 'Supplier Co 4');

    await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload());

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload({ email: 'other@coffeesupplier.test' }));

    expect(res.status).toBe(409);
  });

  it('allows the same supplier name in two different companies', async () => {
    const companyA = await registerCompany('ownerA@sup.test', 'Company A Sup');
    const companyB = await registerCompany('ownerB@sup.test', 'Company B Sup');

    const resA = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send(supplierPayload());
    const resB = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${companyB.token}`)
      .send(supplierPayload());

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });
});

describe('Multi-tenant isolation for suppliers', () => {
  it('returns 404 when fetching another company supplier by id', async () => {
    const companyA = await registerCompany('ownerA2@sup.test', 'Company A2 Sup');
    const companyB = await registerCompany('ownerB2@sup.test', 'Company B2 Sup');

    const created = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send(supplierPayload());

    const res = await request(app)
      .get(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${companyB.token}`);

    expect(res.status).toBe(404);
  });

  it('does not include another company suppliers in the list', async () => {
    const companyA = await registerCompany('ownerA3@sup.test', 'Company A3 Sup');
    const companyB = await registerCompany('ownerB3@sup.test', 'Company B3 Sup');

    await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${companyA.token}`)
      .send(supplierPayload({ name: 'A3 Supplier' }));
    await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${companyB.token}`)
      .send(supplierPayload({ name: 'B3 Supplier' }));

    const listA = await request(app)
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${companyA.token}`);

    const names = listA.body.data.items.map((s: { name: string }) => s.name);
    expect(names).toContain('A3 Supplier');
    expect(names).not.toContain('B3 Supplier');
  });
});

describe('GET /api/v1/suppliers search', () => {
  it('finds a supplier by partial name or contact person (case-insensitive)', async () => {
    const { token } = await registerCompany('owner5@sup.test', 'Supplier Co 5');
    await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload());

    const byName = await request(app)
      .get('/api/v1/suppliers?search=coffee supplier')
      .set('Authorization', `Bearer ${token}`);
    const byContact = await request(app)
      .get('/api/v1/suppliers?search=jonas')
      .set('Authorization', `Bearer ${token}`);

    expect(byName.body.data.items).toHaveLength(1);
    expect(byContact.body.data.items).toHaveLength(1);
  });
});

describe('PATCH & DELETE /api/v1/suppliers/:id', () => {
  it('updates a supplier', async () => {
    const { token } = await registerCompany('owner6@sup.test', 'Supplier Co 6');
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload());

    const res = await request(app)
      .patch(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+47 999 00 000' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+47 999 00 000');
  });

  it('soft-deletes (deactivates) a supplier and rejects deactivating it twice', async () => {
    const { token } = await registerCompany('owner7@sup.test', 'Supplier Co 7');
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send(supplierPayload());

    const firstDelete = await request(app)
      .delete(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(firstDelete.status).toBe(200);
    expect(firstDelete.body.data.isActive).toBe(false);

    const secondDelete = await request(app)
      .delete(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondDelete.status).toBe(409);
  });
});

describe('GET /api/v1/suppliers pagination', () => {
  it('paginates results', async () => {
    const { token } = await registerCompany('owner8@sup.test', 'Supplier Co 8');

    for (let i = 1; i <= 5; i += 1) {
      await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${token}`)
        .send(supplierPayload({ name: `Supplier ${i}`, email: `s${i}@sup.test` }));
    }

    const res = await request(app)
      .get('/api/v1/suppliers?page=1&perPage=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      perPage: 2,
      totalItems: 5,
      totalPages: 3,
    });
  });
});
