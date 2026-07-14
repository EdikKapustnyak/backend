import { z } from 'zod';
import {
  registry,
  successResponse,
  commonErrorResponses,
  validationErrorResponse,
  errorResponseSchema,
} from '../registry.js';
import { inviteUserSchema } from '../../modules/users/user.schema.js';
import { publicUserSchema, inviteResultSchema } from '../responseSchemas.js';

const TAG = 'Users';

registry.registerPath({
  method: 'get',
  path: '/users',
  tags: [TAG],
  summary: "List users in the caller's company",
  description: '`passwordSet: false` means the invite has not been accepted yet.',
  responses: {
    200: {
      description: 'Users in the company',
      content: { 'application/json': { schema: successResponse(z.array(publicUserSchema)) } },
    },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/users',
  tags: [TAG],
  summary: 'Invite a new user',
  description:
    'Owner/admin only. No password in the request - creates a pending user and emails an accept-invite link. If Resend is unconfigured or the send fails, the link is returned as `data.inviteLink` instead. Rejected at the plan\'s user limit (see ADR-0001).',
  request: { body: { content: { 'application/json': { schema: inviteUserSchema } } } },
  responses: {
    201: {
      description: 'Pending user created',
      content: { 'application/json': { schema: successResponse(inviteResultSchema) } },
    },
    409: {
      description: 'Email already registered',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
