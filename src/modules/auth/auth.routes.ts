import { Router } from 'express';
import * as authController from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authRateLimiter } from '../../middlewares/rateLimiter.js';
import { registerCompanySchema, loginSchema } from './auth.schema.js';

export const authRouter = Router();

authRouter.post(
  '/register-company',
  authRateLimiter,
  validate({ body: registerCompanySchema }),
  authController.registerCompany,
);

authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login,
);

authRouter.post('/refresh', authController.refresh);

authRouter.post('/logout', authenticate, authController.logout);

authRouter.get('/me', authenticate, authController.me);
