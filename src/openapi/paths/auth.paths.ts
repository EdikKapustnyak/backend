import { z } from 'zod';
import { registry, successResponse, commonErrorResponses, validationErrorResponse, errorResponseSchema } from '../registry.js';
import { registerCompanySchema, loginSchema, acceptInviteSchema } from '../../modules/auth/auth.schema.js';
import { authTokensSchema, publicSessionSchema, publicUserSchema } from '../responseSchemas.js';

const TAG = 'Auth';

registry.registerPath({
  method: 'post',
  path: '/auth/register-company',
  tags: [TAG],
  summary: 'Register a new company (tenant) and its owner user',
  description: 'Creates the company and its first user (role: owner) in one step. Rate-limited.',
  security: [],
  request: { body: { content: { 'application/json': { schema: registerCompanySchema } } } },
  responses: {
    201: {
      description: 'Company and owner created, logged in immediately',
      content: { 'application/json': { schema: successResponse(authTokensSchema) } },
    },
    409: { description: 'Email already registered', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: [TAG],
  summary: 'Log in',
  description:
    'Rejected with a generic 401 (same message as wrong password) if the account has not accepted its invite yet - see PublicUser.passwordSet.',
  security: [],
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: {
    200: {
      description: 'Logged in - sets the refresh-token cookie, returns the access token',
      content: { 'application/json': { schema: successResponse(authTokensSchema) } },
    },
    401: { description: 'Invalid email or password (or invite not accepted yet)', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/accept-invite',
  tags: [TAG],
  summary: 'Accept an invite: set a password and log in',
  description: 'Public but requires a valid, unexpired, single-use invite token (see POST /users).',
  security: [],
  request: { body: { content: { 'application/json': { schema: acceptInviteSchema } } } },
  responses: {
    200: {
      description: 'Password set, logged in immediately (same shape as login)',
      content: { 'application/json': { schema: successResponse(authTokensSchema) } },
    },
    401: { description: 'Invalid, expired, or already-used token', content: { 'application/json': { schema: errorResponseSchema } } },
    422: validationErrorResponse,
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: [TAG],
  summary: 'Rotate the access/refresh token pair',
  description: 'Reads the refresh token from the httpOnly cookie, not the body. Rotates the token in place (same session id).',
  security: [],
  responses: {
    200: {
      description: 'New access token issued, refresh cookie rotated',
      content: { 'application/json': { schema: successResponse(authTokensSchema) } },
    },
    401: { description: 'Missing, invalid, expired, or reused/revoked refresh token', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: [TAG],
  summary: 'Log out the current device only',
  description: "Revokes only this session - other devices' sessions stay signed in.",
  responses: {
    200: { description: 'Logged out', content: { 'application/json': { schema: successResponse(z.null()) } } },
    ...commonErrorResponses,
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: [TAG],
  summary: 'Get the current user',
  responses: {
    200: {
      description: 'Current user',
      content: { 'application/json': { schema: successResponse(publicUserSchema) } },
    },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/sessions',
  tags: [TAG],
  summary: 'List every active session (device/browser) for the current user',
  description: 'One entry per login. `isCurrent` flags the session making this request.',
  responses: {
    200: {
      description: 'Active sessions',
      content: { 'application/json': { schema: successResponse(z.array(publicSessionSchema)) } },
    },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: 'delete',
  path: '/auth/sessions/{id}',
  tags: [TAG],
  summary: 'Revoke one specific session ("log out that device")',
  request: { params: z.object({ id: z.string().openapi({ description: 'Session id' }) }) },
  responses: {
    200: { description: 'Session revoked', content: { 'application/json': { schema: successResponse(z.null()) } } },
    401: commonErrorResponses[401],
    404: { description: "Session not found or doesn't belong to you", content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/auth/sessions',
  tags: [TAG],
  summary: 'Revoke every session, including the current one ("log out everywhere")',
  responses: {
    200: { description: 'All sessions revoked', content: { 'application/json': { schema: successResponse(z.null()) } } },
    401: commonErrorResponses[401],
  },
});
