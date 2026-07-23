import { z } from 'zod';
import { registry, successResponse, commonErrorResponses, validationErrorResponse, errorResponseSchema } from '../registry.js';
import {
  createContactSubmissionSchema,
  updateContactSubmissionSchema,
  replyToContactSubmissionSchema,
  listContactSubmissionsQuerySchema,
} from '../../modules/contact-submissions/contact-submission.schema.js';
import { ContactChannel, ContactSubmissionStatus } from '../../modules/contact-submissions/contact-submission.types.js';

const PUBLIC_TAG = 'Contact';
const ADMIN_TAG = 'Platform Admin - Leads';

const publicContactSubmissionSchema = registry.register(
  'ContactSubmission',
  z.object({
    id: z.string(),
    name: z.string(),
    company: z.string().nullable(),
    channel: z.nativeEnum(ContactChannel),
    contact: z.string(),
    message: z.string(),
    status: z.nativeEnum(ContactSubmissionStatus),
    note: z.string().nullable(),
    createdAt: z.string(),
  }),
);

registry.registerPath({
  method: 'post',
  path: '/contact',
  tags: [PUBLIC_TAG],
  summary: 'Submit the public landing page contact form',
  description:
    'Public - no auth. Rate-limited per IP (5/hour) since it\'s an unauthenticated write endpoint. Returns no data back (not even the created record) - a landing visitor has no use for it.',
  security: [],
  request: { body: { content: { 'application/json': { schema: createContactSubmissionSchema } } } },
  responses: {
    201: { description: 'Received', content: { 'application/json': { schema: successResponse(z.null()) } } },
    422: validationErrorResponse,
    429: { description: 'Rate limited', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/contact-submissions',
  tags: [ADMIN_TAG],
  summary: 'List landing-page contact submissions',
  description: 'Platform-admin only. Filterable by status, searchable by name/company (same single search box as the design\'s Leads screen).',
  request: { query: listContactSubmissionsQuerySchema },
  responses: {
    200: {
      description: 'Paginated list',
      content: {
        'application/json': {
          schema: successResponse(
            z.object({
              items: z.array(publicContactSubmissionSchema),
              pagination: z.object({
                page: z.number(),
                perPage: z.number(),
                totalItems: z.number(),
                totalPages: z.number(),
                hasNextPage: z.boolean(),
                hasPreviousPage: z.boolean(),
              }),
            }),
          ),
        },
      },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/contact-submissions/open-count',
  tags: [ADMIN_TAG],
  summary: 'Count of open (not-yet-done) submissions',
  description: 'Platform-admin only. Backs the unread-count badge on the Leads nav item in the admin sidebar (see design\'s navItems).',
  responses: {
    200: { description: 'Count', content: { 'application/json': { schema: successResponse(z.object({ count: z.number() })) } } },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/contact-submissions/{id}',
  tags: [ADMIN_TAG],
  summary: 'Advance status and/or leave an internal note',
  description: 'Platform-admin only. Matches the Leads screen\'s "advance" (new → progress → done) and "+ заметка" actions.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: updateContactSubmissionSchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: successResponse(publicContactSubmissionSchema) } } },
    404: { description: 'Not found', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/contact-submissions/{id}/reply',
  tags: [ADMIN_TAG],
  summary: 'Reply to a lead by email',
  description:
    'Platform-admin only. Sends an actual email via Resend to the lead\'s contact address - only possible for channel === "email" (whatsapp/telegram leads have a phone number or handle on file, not an email address, so this fails loudly rather than silently no-opping). Also fails loudly if email delivery isn\'t configured on the server.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: replyToContactSubmissionSchema } } },
  },
  responses: {
    200: { description: 'Sent', content: { 'application/json': { schema: successResponse(z.null()) } } },
    400: { description: 'Lead\'s channel is not email, or email delivery is not configured', content: { 'application/json': { schema: errorResponseSchema } } },
    404: { description: 'Not found', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
