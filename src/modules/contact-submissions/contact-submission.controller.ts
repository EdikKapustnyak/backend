import type { Request, Response } from 'express';
import { ctrlWrapper } from '../../utils/ctrlWrapper.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { parsePaginationParams, calculatePaginationData } from '../../utils/pagination.js';
import { contactSubmissionRepository } from './contact-submission.repository.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../../errors/index.js';
import { mailer, isMailerConfigured } from '../../utils/mailer.js';
import { ContactChannel } from './contact-submission.types.js';
import type { ContactSubmissionStatus } from './contact-submission.types.js';
import type { PublicContactSubmission } from './contact-submission.types.js';
import type { ContactSubmissionDocument } from './contact-submission.model.js';

function toPublicContactSubmission(doc: ContactSubmissionDocument): PublicContactSubmission {
  return {
    id: doc._id.toString(),
    name: doc.name,
    company: doc.company,
    channel: doc.channel,
    contact: doc.contact,
    message: doc.message,
    status: doc.status,
    note: doc.note,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Public - no auth, so intentionally returns almost nothing back (not even the created record) - a landing-page visitor has no use for it, and it avoids echoing their own input back as a confirmation surface for injection-style probing. */
export const createContactSubmission = ctrlWrapper(async (req: Request, res: Response) => {
  await contactSubmissionRepository.create(req.body);
  sendSuccess(res, null, 'Thanks - we\'ll be in touch soon', 201);
});

export const listContactSubmissions = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const pagination = parsePaginationParams(req.query as Record<string, unknown>);
  const status = req.query['status'] as ContactSubmissionStatus | undefined;
  const search = req.query['search'] as string | undefined;

  const { items, totalItems } = await contactSubmissionRepository.findManyPaginated(
    { status, search },
    pagination,
  );

  sendSuccess(res, {
    items: items.map(toPublicContactSubmission),
    pagination: calculatePaginationData(totalItems, pagination.page, pagination.perPage),
  });
});

export const getOpenContactSubmissionsCount = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();
  const count = await contactSubmissionRepository.countOpen();
  sendSuccess(res, { count });
});

export const updateContactSubmission = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const id = req.params['id'] as string;
  const updated = await contactSubmissionRepository.update(id, req.body);
  if (!updated) throw new NotFoundError('Contact submission not found');

  sendSuccess(res, toPublicContactSubmission(updated));
});

/**
 * Sends an actual email to the lead - only possible for channel==='email',
 * since that's the only channel where `contact` is guaranteed to be an
 * email address at all (whatsapp/telegram leads leave a phone number or
 * handle there instead, which mailer.ts obviously can't send to). There's
 * no reasonable fallback here the way invite emails have one
 * (isMailerConfigured() ? send : return the link) - the whole point of
 * this action is the email actually going out, so an unconfigured mailer
 * or a non-email lead both fail loudly rather than silently no-opping.
 */
export const replyToContactSubmission = ctrlWrapper(async (req: Request, res: Response) => {
  if (!req.adminAuth) throw new UnauthorizedError();

  const id = req.params['id'] as string;
  const lead = await contactSubmissionRepository.findById(id);
  if (!lead) throw new NotFoundError('Contact submission not found');

  if (lead.channel !== ContactChannel.EMAIL) {
    throw new BadRequestError(
      `Cannot reply by email - this lead came in via ${lead.channel}, not email`,
    );
  }
  if (!isMailerConfigured()) {
    throw new BadRequestError('Email delivery is not configured (missing RESEND_API_KEY/MAIL_FROM)');
  }

  const message = req.body.message as string;
  await mailer.sendMail({
    to: lead.contact,
    subject: 'Axis Digital',
    html: `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` +
      `<hr>` +
      `<p style="color:#8a93a8;font-size:12px;">В ответ на ваше сообщение: «${escapeHtml(lead.message)}»</p>`,
  });

  sendSuccess(res, null, 'Reply sent');
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
