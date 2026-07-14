import { Router } from 'express';
import * as reportController from './report.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActiveSubscription } from '../../middlewares/requireActiveSubscription.js';
import { validate } from '../../middlewares/validate.js';
import {
  purchasesReportQuerySchema,
  writeOffsReportQuerySchema,
  inventarizationsReportQuerySchema,
} from './report.schema.js';

export const reportRouter = Router();

// companyId is always derived from the verified access token (see
// report.service.ts), never from the client. Reports are read-only
// informational output - open to any authenticated tenant member.
reportRouter.use(authenticate);
reportRouter.use(requireActiveSubscription);

reportRouter.get(
  '/purchases/pdf',
  validate({ query: purchasesReportQuerySchema }),
  reportController.purchasesReportPdf,
);

reportRouter.get(
  '/write-offs/pdf',
  validate({ query: writeOffsReportQuerySchema }),
  reportController.writeOffsReportPdf,
);

reportRouter.get(
  '/inventarizations/pdf',
  validate({ query: inventarizationsReportQuerySchema }),
  reportController.inventarizationsReportPdf,
);
