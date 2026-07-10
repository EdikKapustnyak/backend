import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env.js';

/** General API rate limiter. */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limiters are module-level singletons whose counters persist across
  // the whole process. In tests, many independent test cases share that
  // process, so a real limit would eventually - and non-deterministically -
  // start rejecting unrelated tests. Disabled only when NODE_ENV=test.
  skip: () => isTest,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.',
    },
  },
});

/** Stricter limiter for auth endpoints (login/register) to slow down brute force. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later.',
    },
  },
});
