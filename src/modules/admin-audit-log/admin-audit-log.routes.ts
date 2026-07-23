import { Router } from 'express';
import * as auditLogController from './admin-audit-log.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticateAdmin } from '../platform-admin/authenticateAdmin.js';
import { listAuditLogQuerySchema } from './admin-audit-log.schema.js';

/** Mounted at /admin/audit-log - platform-admin only, read-only. Entries are written by the actions themselves (see admin-company.repository.ts#applyOverride) - there is no direct write endpoint here. */
export const auditLogRouter = Router();

auditLogRouter.use(authenticateAdmin);
auditLogRouter.get('/admins', auditLogController.listAdmins);
auditLogRouter.get('/', validate({ query: listAuditLogQuerySchema }), auditLogController.listAuditLog);
