import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Comma-separated list - see app.ts, which splits this into an array for
  // the cors() middleware. Defaults to both local dev frontends: the
  // tenant app (5173) and the separate admin-frontend (5174).
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Fully separate secrets from the tenant JWT_* pair above - platform-admin
  // auth is a deliberately isolated system (its own model, its own
  // sessions, its own tokens), not a flag layered onto the tenant User
  // model, so even a leak of one secret pair doesn't compromise the other.
  ADMIN_JWT_ACCESS_SECRET: z.string().min(32, 'ADMIN_JWT_ACCESS_SECRET must be at least 32 chars'),
  ADMIN_JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  ADMIN_JWT_REFRESH_SECRET: z.string().min(32, 'ADMIN_JWT_REFRESH_SECRET must be at least 32 chars'),
  ADMIN_JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Deliberately a different cookie name than REFRESH_COOKIE_NAME below - a
  // platform admin browsing the tenant app (or vice versa) in the same
  // browser must never have the two refresh cookies collide or overwrite
  // each other.
  ADMIN_REFRESH_COOKIE_NAME: z.string().default('adminRefreshToken'),

  REFRESH_COOKIE_NAME: z.string().default('refreshToken'),
  COOKIE_DOMAIN: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // How often jobs/gracePeriodSweep.ts scans for PAST_DUE companies whose
  // grace period has elapsed. Grace period itself is measured in whole
  // days (GRACE_PERIOD_DAYS, billing/plan.config.ts), so there's no need
  // to sweep more often than roughly hourly - this just bounds how late
  // our own DB status can lag behind a company's actual grace deadline
  // for a company that stops making requests entirely (see
  // jobs/gracePeriodSweep.ts for why this exists alongside the lazy,
  // per-request escalation in billing.service.ts).
  GRACE_PERIOD_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),

  // Cloudflare R2 (S3-compatible) - only required for the receipts photo
  // upload feature. Left optional here so the rest of the app (and the
  // test suite) works without it configured; objectStorage.ts throws a
  // clear error if these are missing at the point an upload is attempted.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

  // Anthropic API - only required for the AI assistant features (waste
  // analysis narrative, local events). Optional here for the same reason
  // as the R2_* vars above - see anthropicClient.ts.
  ANTHROPIC_API_KEY: z.string().optional(),

  // Resend - only required to actually deliver invite emails. Unlike R2/
  // Anthropic, a missing mailer must NOT break the invite workflow itself
  // (inviting a user has to keep working in local/dev/CI without a Resend
  // account) - see utils/mailer.ts, which falls back to returning the
  // invite link directly in the API response when unconfigured.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // Base URL of the (not-yet-built) frontend, used only to construct the
  // invite-acceptance link embedded in the invite email / fallback response.
  // Defaults to CORS_ORIGIN's default for local dev convenience.
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Stripe - required to actually process payments. Optional here (like
  // R2/Anthropic) so the rest of the app and the test suite work without
  // it configured; stripeClient.ts throws a clear error at the point a
  // billing endpoint is actually called. Unlike mailer.ts, there is no
  // silent fallback for "can't process a payment" - checkout/webhook/
  // portal endpoints simply don't work until this is set.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Prices are computed in code (billing/plan.config.ts) via Stripe's
  // inline `price_data`, not pre-created Stripe Dashboard Price objects -
  // simpler for a small team, no per-plan-per-period IDs to keep in sync.
  // This just picks which currency those inline prices are denominated in.
  STRIPE_CURRENCY: z.string().default('usd'),

  // Swagger/OpenAPI docs at GET /docs (+ raw spec at GET /docs/openapi.json).
  // Defaults to "on everywhere except production" - the docs describe the
  // full request/response shape of every endpoint (no secrets, but still
  // more surface-mapping detail than you'd want world-readable by default
  // on a live deployment). Set to 'true' to force it on in production too.
  ENABLE_API_DOCS: z.enum(['true', 'false']).optional(),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment variables:\n${formatted}`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
// Explicit ENABLE_API_DOCS always wins; otherwise on everywhere except production.
export const apiDocsEnabled =
  env.ENABLE_API_DOCS === 'true' ? true : env.ENABLE_API_DOCS === 'false' ? false : !isProduction;
