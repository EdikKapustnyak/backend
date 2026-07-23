import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry.js';

// Side-effect imports: each of these calls registry.registerPath(...) at
// module load time. Order doesn't matter for correctness, but grouping
// them here (rather than scattering imports across the app) keeps "what
// shows up in the docs" auditable from one place.
import './paths/auth.paths.js';
import './paths/admin-auth.paths.js';
import './paths/contact-submissions.paths.js';
import './paths/admin-companies.paths.js';
import './paths/admin-dashboard.paths.js';
import './paths/admin-audit-log.paths.js';
import './paths/users.paths.js';
import './paths/companies.paths.js';
import './paths/billing.paths.js';
import './paths/warehouses.paths.js';
import './paths/products.paths.js';
import './paths/inventory.paths.js';
import './paths/suppliers.paths.js';
import './paths/purchases.paths.js';
import './paths/write-offs.paths.js';
import './paths/stock-movements.paths.js';
import './paths/inventarizations.paths.js';
import './paths/notifications.paths.js';
import './paths/reports.paths.js';
import './paths/receipts.paths.js';
import './paths/import.paths.js';
import './paths/analytics.paths.js';
import './paths/local-events.paths.js';

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Inventory & Warehouse Management API',
      version: '1.0.0',
      description:
        'Multi-tenant SaaS inventory management backend. Every protected endpoint requires a bearer access token from POST /auth/login (or register-company / accept-invite) - use the Authorize button below. `companyId` is always derived from that token server-side; it is never read from the request body, params, or query.',
    },
    servers: [{ url: '/api/v1' }],
    security: [{ bearerAuth: [] }],
  });
}
