import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { companyRepository } from './company.repository.js';
import { toPublicCompany } from './company.service.js';
import { UnauthorizedError, NotFoundError } from '../../errors/index.js';

export const getMyCompany = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const company = await companyRepository.findById(req.auth.companyId);
  if (!company) throw new NotFoundError('Company not found');

  sendSuccess(res, toPublicCompany(company));
});

export const updateMyCompany = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const company = await companyRepository.updateProfile(req.auth.companyId, req.body);
  if (!company) throw new NotFoundError('Company not found');

  sendSuccess(res, toPublicCompany(company), 'Company profile updated');
});
