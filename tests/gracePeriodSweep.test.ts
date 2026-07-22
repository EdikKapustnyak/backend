import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { CompanyStatus } from '../src/modules/companies/company.types.js';
import { sweepExpiredGracePeriods, startGracePeriodSweep } from '../src/jobs/gracePeriodSweep.js';

const app = createApp();
const strongPassword = 'Sup3rSecret!';

async function registerCompany(email: string, companyName: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/register-company').send({
    companyName,
    ownerName: 'Owner',
    email,
    password: strongPassword,
    city: 'Stavanger',
  });
  return res.body.data.user.companyId as string;
}

async function setPastDue(companyId: string, pastDueSince: Date): Promise<void> {
  await CompanyModel.updateOne(
    { _id: companyId },
    { $set: { status: CompanyStatus.PAST_DUE, pastDueSince } },
  ).exec();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sweepExpiredGracePeriods', () => {
  it('suspends a company whose grace period has elapsed', async () => {
    const companyId = await registerCompany('owner1@sweep.test', 'Sweep Co 1');
    await setPastDue(companyId, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));

    const suspendedCount = await sweepExpiredGracePeriods();

    expect(suspendedCount).toBeGreaterThanOrEqual(1);
    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.SUSPENDED);
  });

  it('does not touch a company still within its grace period', async () => {
    const companyId = await registerCompany('owner2@sweep.test', 'Sweep Co 2');
    await setPastDue(companyId, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

    await sweepExpiredGracePeriods();

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.PAST_DUE);
  });

  it('does not touch an active company', async () => {
    const companyId = await registerCompany('owner3@sweep.test', 'Sweep Co 3');

    await sweepExpiredGracePeriods();

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.ACTIVE);
  });

  it('does not touch an already-suspended company', async () => {
    const companyId = await registerCompany('owner4@sweep.test', 'Sweep Co 4');
    await CompanyModel.updateOne(
      { _id: companyId },
      { $set: { status: CompanyStatus.SUSPENDED, pastDueSince: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) } },
    ).exec();

    const suspendedCount = await sweepExpiredGracePeriods();

    expect(suspendedCount).toBe(0);
  });

  it('suspends every eligible company in a single sweep, not just one', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const companyA = await registerCompany('owner5a@sweep.test', 'Sweep Co 5a');
    const companyB = await registerCompany('owner5b@sweep.test', 'Sweep Co 5b');
    await setPastDue(companyA, eightDaysAgo);
    await setPastDue(companyB, eightDaysAgo);

    const suspendedCount = await sweepExpiredGracePeriods();

    expect(suspendedCount).toBeGreaterThanOrEqual(2);
    const a = await CompanyModel.findById(companyA).exec();
    const b = await CompanyModel.findById(companyB).exec();
    expect(a?.status).toBe(CompanyStatus.SUSPENDED);
    expect(b?.status).toBe(CompanyStatus.SUSPENDED);
  });
});

describe('startGracePeriodSweep', () => {
  it('runs immediately on start and again after each interval, and stops when told to', async () => {
    vi.useFakeTimers();
    const companyId = await registerCompany('owner6@sweep.test', 'Sweep Co 6');
    await setPastDue(companyId, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));

    const stop = startGracePeriodSweep(60_000);
    // The immediate on-boot run fires a real async DB call under fake
    // timers - flush microtasks so it lands before we assert.
    await vi.advanceTimersByTimeAsync(0);

    const company = await CompanyModel.findById(companyId).exec();
    expect(company?.status).toBe(CompanyStatus.SUSPENDED);

    stop();
    const companyId2 = await registerCompany('owner7@sweep.test', 'Sweep Co 7');
    await setPastDue(companyId2, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));

    // Advance well past another interval - stop() should have cleared the
    // timer, so this company must remain untouched.
    await vi.advanceTimersByTimeAsync(120_000);

    const company2 = await CompanyModel.findById(companyId2).exec();
    expect(company2?.status).toBe(CompanyStatus.PAST_DUE);
  });
});
