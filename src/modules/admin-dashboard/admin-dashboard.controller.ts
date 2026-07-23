import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { UnauthorizedError } from '../../errors/index.js';
import { getDashboardSummary } from './admin-dashboard.service.js';

export const getAdminDashboard = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();
  const summary = await getDashboardSummary();
  sendSuccess(res, summary);
});
