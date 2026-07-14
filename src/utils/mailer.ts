import { Resend } from 'resend';
import { env } from '../config/env.js';

/**
 * Thin wrapper around Resend - same "single source of truth for configured
 * state" shape as requireR2Config() in objectStorage.ts. It differs in one
 * deliberate way: R2/Anthropic throw when unconfigured, because uploading a
 * receipt or asking the AI assistant something are actions the caller
 * explicitly opted into. Inviting a user is not - it's a core workflow that
 * must keep working in local/dev/CI environments without a Resend account
 * set up. So getMailerConfig() returns null instead of throwing, and
 * isMailerConfigured() exposes that as a boolean callers branch on (see
 * user.service.ts, which falls back to returning the invite link directly
 * in the API response instead of emailing it).
 */

interface MailerConfig {
  apiKey: string;
  from: string;
}

function getMailerConfig(): MailerConfig | null {
  const { RESEND_API_KEY, MAIL_FROM } = env;
  if (!RESEND_API_KEY || !MAIL_FROM) return null;
  return { apiKey: RESEND_API_KEY, from: MAIL_FROM };
}

export function isMailerConfigured(): boolean {
  return getMailerConfig() !== null;
}

let client: Resend | null = null;

function getClient(apiKey: string): Resend {
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export const mailer = {
  /**
   * Throws on provider-side failure (bad API key, Resend outage, rejected
   * address, etc.) or if called without checking isMailerConfigured() first
   * - the caller is responsible for catching this and falling back
   * gracefully, not this module.
   */
  async sendMail(input: SendMailInput): Promise<void> {
    const config = getMailerConfig();
    if (!config) {
      throw new Error('Mailer is not configured (missing RESEND_API_KEY/MAIL_FROM)');
    }

    const { error } = await getClient(config.apiKey).emails.send({
      from: config.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    if (error) {
      throw new Error(`Resend rejected the email: ${error.message}`);
    }
  },
};
