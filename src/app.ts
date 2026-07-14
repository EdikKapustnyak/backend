import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env, apiDocsEnabled } from './config/env.js';
import { logger } from './utils/logger.js';
import { securityHeaders } from './middlewares/securityHeaders.js';
import { apiRateLimiter } from './middlewares/rateLimiter.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/index.js';
import * as billingController from './modules/billing/billing.controller.js';
import { docsRouter } from './openapi/docsRouter.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger }));

  // Stripe's webhook signature is computed over the exact raw request
  // bytes, so this one route must be registered with express.raw() BEFORE
  // the global express.json() below - by the time a request reaches a
  // route nested under apiRouter, express.json() has already replaced
  // req.body with a parsed object, and the original bytes are gone.
  // Mounted directly on `app`, not inside apiRouter/billingRouter, for
  // that reason - see billing.routes.ts and billing.controller.ts.
  // (pino-http is registered above this, not below, so webhook deliveries
  // still get logged - it only reads headers, never req.body.)
  app.post(
    `${env.API_PREFIX}/billing/webhook`,
    express.raw({ type: 'application/json' }),
    billingController.stripeWebhook,
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(apiRateLimiter);

  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' }, message: '' });
  });

  // Swagger UI + raw OpenAPI JSON. Off by default in production (the docs
  // describe every endpoint's full request/response shape - no secrets,
  // but more API-surface detail than should be world-readable by default
  // on a live deployment) - set ENABLE_API_DOCS=true to force it on. Sits
  // outside API_PREFIX since it's tooling/meta, not a versioned API
  // resource itself.
  if (apiDocsEnabled) {
    app.use('/docs', docsRouter);
  }

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
