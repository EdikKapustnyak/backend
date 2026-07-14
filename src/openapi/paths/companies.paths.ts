import { registry, successResponse, commonErrorResponses, validationErrorResponse } from '../registry.js';
import { updateCompanyProfileSchema } from '../../modules/companies/company.schema.js';
import { publicCompanySchema } from '../responseSchemas.js';

const TAG = 'Companies';

registry.registerPath({
  method: 'get',
  path: '/companies/me',
  tags: [TAG],
  summary: "Get the caller's own company profile",
  responses: {
    200: {
      description: 'Company profile',
      content: { 'application/json': { schema: successResponse(publicCompanySchema) } },
    },
    401: commonErrorResponses[401],
  },
});

registry.registerPath({
  method: 'patch',
  path: '/companies/me',
  tags: [TAG],
  summary: 'Update company profile',
  description: 'Owner/admin only. Blocked while the subscription is past_due/suspended.',
  request: {
    body: { content: { 'application/json': { schema: updateCompanyProfileSchema } } },
  },
  responses: {
    200: {
      description: 'Updated company profile',
      content: { 'application/json': { schema: successResponse(publicCompanySchema) } },
    },
    422: validationErrorResponse,
    ...commonErrorResponses,
  },
});
