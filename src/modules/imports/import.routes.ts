import { Router } from 'express';
import * as importController from './import.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { uploadSingleXlsxFile } from '../../middlewares/uploadXlsx.js';
import { Role } from '../users/user.types.js';

export const importRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see import.controller.ts), never from the client.
importRouter.use(authenticate);
importRouter.use(requireActiveSubscription);

// Same roles allowed to create warehouses/suppliers/products individually
// (see each module's *.routes.ts) - bulk import is just many creates.
importRouter.get(
  '/template',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  importController.downloadImportTemplate,
);

importRouter.post(
  '/xlsx/preview',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  uploadSingleXlsxFile('file'),
  importController.previewImportXlsx,
);

importRouter.post(
  '/xlsx',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  uploadSingleXlsxFile('file'),
  importController.importXlsx,
);
