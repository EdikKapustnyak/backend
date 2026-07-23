import { Router } from 'express';
import * as contactSubmissionController from './contact-submission.controller.js';
import { validate } from '../../middlewares/validate.js';
import { isValidId } from '../../middlewares/isValidId.js';
import { contactFormRateLimiter } from '../../middlewares/rateLimiter.js';
import { authenticateAdmin } from '../platform-admin/authenticateAdmin.js';
import {
  createContactSubmissionSchema,
  replyToContactSubmissionSchema,
  updateContactSubmissionSchema,
  listContactSubmissionsQuerySchema,
} from './contact-submission.schema.js';

/** Mounted at /contact - public, no auth. The landing page's contact form (see LandingContactForm.tsx). */
export const contactSubmissionPublicRouter = Router();

contactSubmissionPublicRouter.post(
  '/',
  contactFormRateLimiter,
  validate({ body: createContactSubmissionSchema }),
  contactSubmissionController.createContactSubmission,
);

/** Mounted at /admin/contact-submissions - platform-admin only (see modules/platform-admin). */
export const contactSubmissionAdminRouter = Router();

contactSubmissionAdminRouter.use(authenticateAdmin);

contactSubmissionAdminRouter.get(
  '/',
  validate({ query: listContactSubmissionsQuerySchema }),
  contactSubmissionController.listContactSubmissions,
);

// Must come before /:id - "open-count" would otherwise be caught by /:id
// and rejected by isValidId() as a malformed ObjectId.
contactSubmissionAdminRouter.get('/open-count', contactSubmissionController.getOpenContactSubmissionsCount);

contactSubmissionAdminRouter.patch(
  '/:id',
  isValidId(),
  validate({ body: updateContactSubmissionSchema }),
  contactSubmissionController.updateContactSubmission,
);

contactSubmissionAdminRouter.post(
  '/:id/reply',
  isValidId(),
  validate({ body: replyToContactSubmissionSchema }),
  contactSubmissionController.replyToContactSubmission,
);
