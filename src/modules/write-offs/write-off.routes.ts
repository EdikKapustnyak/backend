import { Router } from 'express';
import * as writeOffController from './write-off.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { Role } from '../users/user.types.js';
import { createWriteOffSchema, listWriteOffsQuerySchema } from './write-off.schema.js';

export const writeOffRouter = Router();

// companyId for every operation below is always derived from the verified
// access token (see write-off.controller.ts), never from the client.
writeOffRouter.use(authenticate);

writeOffRouter.get(
  '/',
  validate({ query: listWriteOffsQuerySchema }),
  writeOffController.listWriteOffs,
);

writeOffRouter.get('/:id', isValidId(), writeOffController.getWriteOff);

// Any authenticated tenant member - including `employee` - can flag a
// write-off. Confirming or cancelling it is a manager-level decision.
writeOffRouter.post(
  '/',
  validate({ body: createWriteOffSchema }),
  writeOffController.createWriteOff,
);

writeOffRouter.post(
  '/:id/confirm',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  writeOffController.confirmWriteOff,
);

writeOffRouter.post(
  '/:id/cancel',
  requireRole(Role.OWNER, Role.ADMIN, Role.MANAGER),
  isValidId(),
  writeOffController.cancelWriteOff,
);
