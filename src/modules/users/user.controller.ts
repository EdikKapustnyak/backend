import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { userRepository } from './user.repository.js';
import { toPublicUser } from './user.service.js';
import { hashPassword } from '../../utils/password.js';
import { ConflictError, UnauthorizedError } from '../../errors/index.js';

export const inviteUser = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const emailTaken = await userRepository.existsByEmail(req.body.email);
  if (emailTaken) {
    throw new ConflictError('Email is already registered');
  }

  const passwordHash = await hashPassword(req.body.password);
  const user = await userRepository.create({
    // companyId is ALWAYS taken from the verified JWT context, never from
    // the request body, so a member of one tenant can never create a user
    // in another tenant.
    companyId: req.auth.companyId,
    name: req.body.name,
    email: req.body.email,
    passwordHash,
    role: req.body.role,
  });

  sendSuccess(res, toPublicUser(user), 'User invited successfully', 201);
});

export const listUsers = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const users = await userRepository.findManyInCompany(req.auth.companyId);
  sendSuccess(res, users.map(toPublicUser), 'Users in company');
});
