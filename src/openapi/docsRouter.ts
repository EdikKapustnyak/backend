import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from './generateDocument.js';

/**
 * Generated once at startup (route registration doesn't change at
 * runtime), not per-request - regenerating the whole document on every
 * hit to /docs would be wasteful for something that never changes
 * without a restart.
 */
const document = generateOpenApiDocument();

export const docsRouter = Router();

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(document);
});

docsRouter.use('/', swaggerUi.serve, swaggerUi.setup(document));
