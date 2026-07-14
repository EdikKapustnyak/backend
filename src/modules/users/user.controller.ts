import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { userRepository } from './user.repository.js';
import { userService, toPublicUser } from './user.service.js';
import { UnauthorizedError } from '../../errors/index.js';

export const inviteUser = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  // companyId is ALWAYS taken from the verified JWT context, never from
  // the request body, so a member of one tenant can never create a user
  // in another tenant.
  const result = await userService.inviteNewUser(req.body, req.auth.companyId);

  const message = result.inviteLink
    ? 'User invited - email delivery is not configured or failed, share this link with them manually'
    : 'Invitation email sent';

  sendSuccess(res, result, message, 201);
});

export const listUsers = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const users = await userRepository.findManyInCompany(req.auth.companyId);
  sendSuccess(res, users.map(toPublicUser), 'Users in company');
});
