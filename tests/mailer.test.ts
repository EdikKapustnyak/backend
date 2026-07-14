import { describe, it, expect } from 'vitest';
import { mailer, isMailerConfigured } from '../src/utils/mailer.js';

describe('mailer (unconfigured - no RESEND_API_KEY/MAIL_FROM in the test environment)', () => {
  it('reports itself as not configured', () => {
    expect(isMailerConfigured()).toBe(false);
  });

  it('throws a clear error instead of a cryptic SDK failure when sending', async () => {
    await expect(
      mailer.sendMail({ to: 'someone@example.com', subject: 'Hi', html: '<p>Hi</p>' }),
    ).rejects.toThrow(/Mailer is not configured/);
  });
});
