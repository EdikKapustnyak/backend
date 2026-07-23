import { z } from 'zod';
import { registry, successResponse, commonErrorResponses, validationErrorResponse, errorResponseSchema } from '../registry.js';
import { adminLoginSchema } from '../../modules/platform-admin/admin-auth.schema.js';
import { adminAuthTokensSchema, publicPlatformAdminSchema } from '../responseSchemas.js';

const TAG = 'Platform Admin - Auth';

registry.registerPath({
  method: 'post',
  path: '/admin/auth/login',
  tags: [TAG],
  summary: 'Log in as a platform admin',
  description:
    'Fully separate from POST /auth/login - a different collection, different JWT secrets, different refresh cookie. No public registration exists for this account type; admins are provisioned via scripts/create-platform-admin.ts only. Rate-limited the same as the tenant login endpoint.',
  security: [],
  request: { body: { content: { 'application/json': { schema: adminLoginSchema } } } },
  responses: {
    200: {
      description: 'Logged in - sets the adminRefreshToken cookie, returns the access token',
      content: { 'application/json': { schema: successResponse(adminAuthTokensSchema) } },
    },
    401: { description: 'Invalid email or password', content: { 'application/json': { schema: errorResponseSchema } } },
    403: { description: 'Account deactivated', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/auth/refresh',
  tags: [TAG],
  summary: 'Rotate the admin refresh token',
  description: 'Reads the adminRefreshToken cookie (not a request body) - mirrors POST /auth/refresh\'s rotation/replay-detection behavior exactly, in its own separate session collection.',
  security: [],
  responses: {
    200: {
      description: 'New access token issued, refresh cookie rotated',
      content: { 'application/json': { schema: successResponse(adminAuthTokensSchema) } },
    },
    401: { description: 'Missing, invalid, or reused refresh token', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/auth/logout',
  tags: [TAG],
  summary: 'Log out (revoke the current admin session)',
  responses: {
    200: { description: 'Logged out', content: { 'application/json': { schema: successResponse(z.null()) } } },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/auth/me',
  tags: [TAG],
  summary: 'Get the currently authenticated platform admin',
  responses: {
    200: { description: 'The admin', content: { 'application/json': { schema: successResponse(publicPlatformAdminSchema) } } },
    ...commonErrorResponses,
  },
});
