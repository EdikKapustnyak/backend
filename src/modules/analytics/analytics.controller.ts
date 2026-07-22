import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { getWasteAnalytics, getWasteAnalyticsWithNarrative, getRevenueAnalytics } from './analytics.service.js';
import { UnauthorizedError } from '../../errors/index.js';

export const wasteAnalytics = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const from = req.query['from'] as Date | undefined;
  const to = req.query['to'] as Date | undefined;

  const result = await getWasteAnalytics(req.auth.companyId, from, to);
  sendSuccess(res, result);
});

export const revenueAnalytics = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const from = req.query['from'] as Date | undefined;
  const to = req.query['to'] as Date | undefined;

  const result = await getRevenueAnalytics(req.auth.companyId, from, to);
  sendSuccess(res, result);
});

export const wasteAnalyticsNarrative = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const from = req.query['from'] as Date | undefined;
  const to = req.query['to'] as Date | undefined;

  const result = await getWasteAnalyticsWithNarrative(req.auth.companyId, from, to);
  sendSuccess(res, result);
});
