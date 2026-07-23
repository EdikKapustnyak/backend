import { Router } from 'express';
import * as adminCompanyController from './admin-company.controller.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { authenticateAdmin } from '../platform-admin/authenticateAdmin.js';
import { listAdminCompaniesQuerySchema, overrideCompanySchema } from './admin-company.schema.js';

/** Mounted at /admin/companies - platform-admin only. Deliberately no create/update/delete here yet - "companies list + detail, no admin actions" is its own priority step (see the functional spec); overrides come later as their own endpoints. */
export const adminCompanyRouter = Router();

adminCompanyRouter.use(authenticateAdmin);

adminCompanyRouter.get(
  '/',
  validate({ query: listAdminCompaniesQuerySchema }),
  adminCompanyController.listAdminCompanies,
);

adminCompanyRouter.get('/:id', isValidId(), adminCompanyController.getAdminCompanyDetail);

adminCompanyRouter.post(
  '/:id/override',
  isValidId(),
  validate({ body: overrideCompanySchema }),
  adminCompanyController.overrideAdminCompany,
);
