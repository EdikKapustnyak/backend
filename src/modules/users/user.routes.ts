import { Router } from 'express';
import * as userController from './user.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { requireRole } from '../../middlewares/requireRole.js';
import { validate } from '../../middlewares/validate.js';
import { Role } from './user.types.js';
import { inviteUserSchema } from './user.schema.js';

export const userRouter = Router();

// All routes below require a valid access token; companyId is always
// derived from it (see user.controller.ts), never accepted from the client.
userRouter.use(authenticate);
userRouter.use(requireActiveSubscription);

userRouter.get('/', userController.listUsers);

userRouter.post(
  '/',
  requireRole(Role.OWNER, Role.ADMIN),
  validate({ body: inviteUserSchema }),
  userController.inviteUser,
);
