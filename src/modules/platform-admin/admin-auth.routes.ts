import { Router } from 'express';
import * as adminAuthController from './admin-auth.controller.js';
import { authenticateAdmin } from './authenticateAdmin.js';
import { validate } from '../../middlewares/validate.js';
import { authRateLimiter } from '../../middlewares/rateLimiter.js';
import { adminLoginSchema } from './admin-auth.schema.js';

export const adminAuthRouter = Router();

// Same brute-force protection as the tenant login endpoint - no public
// registration exists here at all (see admin.model.ts's doc comment), so
// login is the only unauthenticated entry point that needs it.
adminAuthRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: adminLoginSchema }),
  adminAuthController.adminLogin,
);

adminAuthRouter.post('/refresh', adminAuthController.adminRefresh);

adminAuthRouter.post('/logout', authenticateAdmin, adminAuthController.adminLogout);

adminAuthRouter.get('/me', authenticateAdmin, adminAuthController.getCurrentAdmin);
