import { Router } from 'express';
import * as companyController from './company.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { Role } from '../users/user.types.js';
import { updateCompanyProfileSchema } from './company.schema.js';

export const companyRouter = Router();

// companyId is always derived from the verified access token - there is no
// "get/update company by id" for an arbitrary company, only "my own".
companyRouter.use(authenticate);
companyRouter.use(requireActiveSubscription);

companyRouter.get('/me', companyController.getMyCompany);

companyRouter.patch(
  '/me',
  requireRole(Role.OWNER, Role.ADMIN),
  validate({ body: updateCompanyProfileSchema }),
  companyController.updateMyCompany,
);
