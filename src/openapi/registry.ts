import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

/**
 * Must run before any Zod schema is handed to the registry - this patches
 * ZodType's prototype with the internal metadata the generator depends on
 * to walk schemas, not just the ones that call `.openapi(...)` themselves.
 * Every existing `*.schema.ts` file in this codebase is used AS-IS below
 * (none of them were modified to add `.openapi()` calls) - this is what
 * makes that possible without touching already-shipped, already-tested
 * validation schemas.
 */
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    'Access token from POST /auth/login, POST /auth/register-company, or POST /auth/accept-invite (`data.accessToken` in the response). Short-lived (15 min default) - see POST /auth/refresh.',
});

/** Every error response in this API follows this exact shape - see errors/AppError.ts. */
export const errorResponseSchema = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: z.object({
      code: z.enum([
        'BAD_REQUEST',
        'VALIDATION_ERROR',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'CONFLICT',
        'INTERNAL_ERROR',
      ]),
      message: z.string(),
    }),
  }),
);

/** Shape of `data.pagination` on every paginated list endpoint - see utils/pagination.ts. */
export const paginationSchema = registry.register(
  'Pagination',
  z.object({
    page: z.number().int(),
    perPage: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
);

/**
 * Wraps a data schema in this API's standard success envelope
 * (`{success, data, message}` - see utils/apiResponse.ts). Not registered
 * as a named component itself since the wrapped shape differs per
 * endpoint; `dataSchema` should already be (or wrap) a registered
 * component so it shows up as a named $ref, not a huge inlined blob.
 */
export function successResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string(),
  });
}

/** Wraps an item schema in the standard `{items, pagination}` list shape. */
export function paginatedListSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: paginationSchema,
  });
}

/** Common `4xx` responses most protected endpoints can return, keyed by status. Merge into a path's own `responses` object. */
export const commonErrorResponses = {
  401: {
    description: 'Missing or invalid access token',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description:
      'Insufficient role, subscription past_due/suspended, or a plan feature/resource limit',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
} as const;

export const notFoundResponse = {
  description: 'Not found, or belongs to a different company (tenant-scoped 404)',
  content: { 'application/json': { schema: errorResponseSchema } },
} as const;

export const validationErrorResponse = {
  description: 'Request failed validation',
  content: { 'application/json': { schema: errorResponseSchema } },
} as const;
