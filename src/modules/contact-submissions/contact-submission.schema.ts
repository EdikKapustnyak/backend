import { z } from 'zod';
import { ContactChannel, ContactSubmissionStatus } from './contact-submission.types.js';

/** Public - the landing page's contact form. No auth, so kept intentionally minimal/forgiving (a visitor should never see a validation error over something trivial). */
export const createContactSubmissionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  company: z.string().trim().max(160).optional(),
  channel: z.nativeEnum(ContactChannel),
  contact: z.string().trim().min(1, 'Contact info is required').max(200),
  message: z.string().trim().min(1, 'Message is required').max(2000),
});

/** Admin-only - marking progress and leaving an internal note (see section 5 of the functional spec / the Leads screen's "advance"/"+ note" actions). */
export const updateContactSubmissionSchema = z.object({
  status: z.nativeEnum(ContactSubmissionStatus).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const listContactSubmissionsQuerySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  status: z.nativeEnum(ContactSubmissionStatus).optional(),
  /** Matches against name and company, same as the design mockup's single search box. */
  search: z.string().trim().max(160).optional(),
});

/** Admin-only - sends an actual email to the lead's contact address (see contact-submission.controller.ts#replyToContactSubmission). Only meaningful for channel === 'email'; whatsapp/telegram leads have no email address on file to send to. */
export const replyToContactSubmissionSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(5000),
});

export type CreateContactSubmissionInput = z.infer<typeof createContactSubmissionSchema>;
export type UpdateContactSubmissionInput = z.infer<typeof updateContactSubmissionSchema>;
export type ListContactSubmissionsQuery = z.infer<typeof listContactSubmissionsQuerySchema>;
export type ReplyToContactSubmissionInput = z.infer<typeof replyToContactSubmissionSchema>;
