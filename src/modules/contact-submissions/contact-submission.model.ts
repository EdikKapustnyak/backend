import { Schema, model, type HydratedDocument } from 'mongoose';
import type { ContactSubmissionDocumentShape } from './contact-submission.types.js';
import { ContactChannel, ContactSubmissionStatus } from './contact-submission.types.js';

export type ContactSubmissionDocument = HydratedDocument<ContactSubmissionDocumentShape>;

/**
 * Submissions from the public landing page's contact form (see
 * LandingContactForm.tsx) - not tenant data at all, so no companyId and
 * no tenantScopePlugin. `company` is just whatever free-text name the
 * visitor typed in, not a reference to an actual Company document (most
 * submitters aren't customers yet).
 */
const contactSubmissionSchema = new Schema<ContactSubmissionDocumentShape>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 160,
      default: null,
    },
    channel: {
      type: String,
      enum: Object.values(ContactChannel),
      required: true,
    },
    contact: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: Object.values(ContactSubmissionStatus),
      required: true,
      default: ContactSubmissionStatus.NEW,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  { timestamps: true },
);

contactSubmissionSchema.index({ status: 1, createdAt: -1 });

export const ContactSubmissionModel = model<ContactSubmissionDocumentShape>(
  'ContactSubmission',
  contactSubmissionSchema,
);
