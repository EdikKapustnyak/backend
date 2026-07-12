import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { getLocalEvents } from './local-event.service.js';
import { UnauthorizedError } from '../../errors/index.js';

export const localEvents = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.auth) throw new UnauthorizedError();

  const forceRefresh = req.query['refresh'] === 'true';
  const result = await getLocalEvents(req.auth.companyId, forceRefresh);

  sendSuccess(res, result);
});
