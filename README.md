# Inventory & Warehouse Management System — Backend

Stage 1 (Foundation): multi-tenant Auth + RBAC + core infrastructure.
Stack: Node.js, Express, TypeScript (strict), MongoDB/Mongoose, Zod, JWT.

## Setup

```bash
npm install
cp .env.example .env   # then fill in real secrets
npm run dev             # http://localhost:3000
```

Requires a running MongoDB instance reachable at `MONGODB_URI`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run compiled build |
| `npm test` | Run Vitest + Supertest integration tests (in-memory MongoDB) |
| `npm run lint` | ESLint |

## Folder structure

```
assets/
└── fonts/                 # DejaVu Sans (Regular + Bold) - embedded in PDF reports for Cyrillic support
src/
├── server.ts            # entry point: DB connect, listen, graceful shutdown
├── app.ts                # Express app: middleware pipeline, routes, error handler
├── config/                # env validation (Zod), DB connection
├── modules/
│   ├── auth/               # register-company, login, refresh, logout, me,
│   │                        # + multi-device session list/revoke (session.*)
│   ├── users/               # tenant-scoped user management (invite via
│   │                        # email token, list) + invite.* (pending-user
│   │                        # token model, TTL-indexed like Session)
│   ├── companies/            # company (tenant) model + repository
│   ├── warehouses/           # tenant-scoped warehouse CRUD (soft delete)
│   ├── products/             # tenant-scoped product catalog (soft delete)
│   ├── inventory/            # stock levels per product+warehouse (quantity/reserved)
│   ├── suppliers/            # tenant-scoped supplier directory (soft delete)
│   ├── purchases/            # draft → completed/cancelled receipts; completion increases stock
│   ├── write-offs/           # draft → confirmed/cancelled; confirmation decreases stock
│   ├── stock-movements/      # read-only audit ledger, written by the modules below
│   ├── inventarizations/     # draft → completed/cancelled stock count; completion reconciles to fact
│   ├── notifications/        # read-only + resolve; system-generated low-stock & discrepancy alerts
│   ├── reports/              # PDF report generation (Purchases, Write-offs,
│   │                          # Inventarizations) - no model, reads other modules
│   ├── receipts/             # receipt photo upload (R2 storage) - soft delete, presigned view URLs
│   ├── companies/            # company (tenant) model/repository + GET/PATCH /companies/me (name, city, businessType)
│   ├── analytics/            # waste analysis - deterministic Mongo aggregation + optional AI narrative
│   │                          # (available on every plan - see billing/plan.config.ts)
│   ├── local-events/         # AI + web-search event recommendations by city, cached 7 days per company
│   │                          # (available on every plan - see billing/plan.config.ts)
│   └── billing/              # Stripe checkout/portal/webhook + plan.config.ts (PLAN_LIMITS,
│                              # pricing) - single source of truth for tier limits/feature
│                              # gates, see ADR-0001 and the "Billing & subscriptions" section
├── middlewares/            # authenticate, requireRole, requireActiveSubscription (blocks
│                            # writes for past_due/suspended companies, reads always pass;
│                            # also lazily escalates past_due -> suspended past the grace
│                            # period), requireFeature (plan-gated features - not currently
│                            # wired to any route, kept as reusable infra), enforceTenant,
│                            # validate, isValidId, upload (multer), errorHandler,
│                            # notFoundHandler, rateLimiter, securityHeaders
├── errors/                 # AppError + typed subclasses
├── utils/                  # jwt, password hashing, pagination, objectId (Zod),
│                            # htmlToPdf (Puppeteer engine, not wired to a route
│                            # yet), htmlReportTemplate, escapeHtml, mailer
│                            # (Resend, optional - falls back to returning the
│                            # invite link when unconfigured, see point 2),
│                            # stripeClient (Stripe SDK wrapper, same throw-if-
│                            # unconfigured shape as R2 - see point 26),
│                            # tenantScopePlugin (structural multi-tenancy
│                            # enforcement, see point 25 / Multi-tenancy
│                            # section), tokenHash (SHA-256, for refresh +
│                            # invite tokens - NOT bcrypt, see point 24 below), etc.
├── openapi/                # Swagger/OpenAPI doc generation - registry.ts
│                            # (shared registry + common schemas), responseSchemas.ts
│                            # (Zod mirrors of every PublicX shape), paths/*.paths.ts
│                            # (one file per module, reusing that module's real
│                            # *.schema.ts as-is), generateDocument.ts, docsRouter.ts.
│                            # See "API Documentation" section.
└── types/                  # Express Request augmentation (req.auth)
tests/
├── setup.ts               # in-memory MongoDB replica-set lifecycle for tests
├── auth.test.ts            # auth flow + multi-tenant isolation + RBAC + accept-invite login-block tests
├── invites.test.ts          # invite creation, mailer-unconfigured fallback link, accept (reuse/expiry/weak password)
├── mailer.test.ts            # unit test: clear error when Resend isn't configured (unmocked)
├── tenantScopePlugin.test.ts   # exercises the plugin directly against a real model - query/save/aggregate hooks + skipTenantScope
├── billing.test.ts              # checkout/portal (mocked Stripe SDK), webhook event->Company-state mapping, requireActiveSubscription, resource limits
├── openapi.test.ts                # generated document structure (one path per module, security schemes) + GET /docs and /docs/openapi.json respond
├── warehouses.test.ts       # warehouse CRUD + tenant isolation + RBAC + pagination
├── products.test.ts         # product CRUD + unique SKU/barcode + search + RBAC
├── inventory.test.ts         # stock create/adjust + FK tenant checks + RBAC
├── suppliers.test.ts          # supplier CRUD + unique name + search + RBAC
├── purchases.test.ts           # draft/complete/cancel workflow + stock increase + RBAC + transaction rollback
├── write-offs.test.ts           # draft/confirm/cancel workflow + role split + transaction rollback
├── stock-movements.test.ts       # movement generation from all sources + tenant isolation + rollback
├── inventarizations.test.ts       # auto-populate/count/complete workflow + reconciliation + rollback
├── notifications.test.ts           # low-stock open/dedupe/auto-resolve + discrepancy alerts + RBAC
├── reports.test.ts                  # PDF generation (Purchases/Write-offs/Inventarizations), filters, empty datasets, RBAC
├── htmlToPdf.test.ts                 # escapeHtml + wrapReportHtml unit tests (Puppeteer engine)
├── receipts.test.ts                   # upload/list/update/soft-delete + RBAC + tenant isolation (objectStorage mocked)
├── objectStorage.test.ts              # unit test: clear error when R2 isn't configured (unmocked)
├── companies.test.ts                   # GET/PATCH /companies/me + RBAC
├── analytics.test.ts                    # waste aggregation correctness + tenant isolation + mocked AI narrative
├── local-events.test.ts                  # cache-first/refresh/per-company isolation + mocked AI+web-search
├── anthropicClient.test.ts                # unit test: clear error when ANTHROPIC_API_KEY isn't configured
└── tokenHash.test.ts                       # regression guard for the bcrypt-truncation bug (point 24)
```

Each future domain module (`notifications`) should follow the same shape as
`inventarizations/`: `*.model.ts`, `*.repository.ts`,
`*.service.ts`, `*.controller.ts`, `*.routes.ts`, `*.schema.ts`,
`*.types.ts`.

## Multi-tenancy — how isolation is enforced

- Every protected route runs through `authenticate`, which verifies the JWT
  and attaches a trusted `req.auth = { userId, companyId, role }`.
- **`companyId` is never read from the request body, params, or query** in any
  controller or service — only from `req.auth.companyId`, which comes from the
  signed token. This is what prevents tenant spoofing.
- `enforceTenant` middleware is available as a second line of defense for
  nested routes that also carry a `:companyId` param.
- **Structural enforcement, not just convention**: every tenant-scoped
  schema (13 of them — everything with a `companyId` field except `Company`
  itself and `Session`, which is scoped by `userId` instead) runs
  `schema.plugin(tenantScopePlugin)` (`utils/tenantScopePlugin.ts`). It
  hooks `find`/`findOne`/`findOneAndUpdate`/`updateOne`/`updateMany`/
  `deleteOne`/`deleteMany`/`countDocuments` (plus `save` and `aggregate`)
  and **throws a 500 if the query has no `companyId` in its filter**,
  instead of silently running unscoped. A query author who genuinely needs
  an untenanted lookup (global email uniqueness, the refresh-token flow,
  invite-token lookups) has to say so explicitly with
  `.setOptions({ skipTenantScope: true })` — see `user.repository.ts` /
  `invite.repository.ts` for the 8 current cases, all pre-existing and
  already audited, not new exceptions introduced by the plugin. It does
  **not** verify the companyId is *correct*, and does **not** auto-inject
  one (no request-scoped context/AsyncLocalStorage in this codebase) —
  see the plugin's own doc comment for the full, honest list of what it
  does and doesn't catch. `tests/tenantScopePlugin.test.ts` exercises it
  directly against a real model.

## RBAC

Roles (`src/modules/users/user.types.ts`): `owner > admin > manager > employee`.
`requireRole(...)` middleware restricts routes; the first user of a company
(created via `register-company`) is always `owner` and cannot be reassigned
through the invite endpoint.

## Billing & subscriptions

Implements ADR-0001 (`docs/adr/0001-payments-and-subscriptions.md`) - see
that file for the reasoning; this section is the "what actually runs"
summary.

- **Provider: Stripe.** `utils/stripeClient.ts` wraps the SDK, following
  the same throw-at-point-of-use shape as `objectStorage.ts`/R2 - there's
  no fallback for an unconfigured Stripe the way there is for `mailer.ts`.
- **Checkout**: `POST /billing/checkout` creates (or reuses) a Stripe
  Customer for the company, then a Checkout Session priced inline via
  Stripe's `price_data` (`billing/plan.config.ts` computes the total from
  `plan`+`period`) - no per-plan-per-period Price objects to keep in sync
  in the Stripe Dashboard. Basic isn't sold this way; it's the free
  default every company starts on.
- **Webhook**: `POST /billing/webhook` is the only unauthenticated,
  raw-body route in the app - mounted directly in `app.ts`, *before* the
  global `express.json()`, because Stripe's signature is computed over
  the exact request bytes. It updates `Company.status`/`subscriptionPlan`/
  `stripeSubscriptionId`/`currentPeriodEnd` in response to
  `checkout.session.completed`, `invoice.payment_failed`,
  `invoice.payment_succeeded`, and `customer.subscription.deleted`.
- **Grace period**: a failed payment sets `CompanyStatus.PAST_DUE` (not
  straight to `suspended`) + `pastDueSince`. `requireActiveSubscription`
  (wired into every router except `/auth` and `/billing` itself) blocks
  writes for `past_due`/`suspended` companies but always allows reads -
  a company can still see its data and fix its payment method, just not
  create more data it isn't paying for. **Confirmed: 7-day grace period**
  (`GRACE_PERIOD_DAYS` in `billing/plan.config.ts`) - `past_due` auto-
  escalates to `suspended` once it elapses, checked lazily wherever
  company status is actually read for enforcement (`requireActiveSubscription`,
  `authService.login`) rather than via a cron job - there's no job
  scheduler anywhere in this codebase (TTL-indexed collections rely on
  MongoDB's own background sweep instead), so this follows the same
  shape. A company that stops making requests/logging in entirely never
  gets escalated this way - Stripe's own subscription cancellation
  (`customer.subscription.deleted` → `suspended`) is the actual backstop
  for that case.
- **Tier limits** (confirmed business numbers, not ADR-0001's originally
  illustrative ones): Basic - 1 warehouse, 35 users. Business - 5
  warehouses, 150 users. Enterprise - unlimited. `billing/plan.config.ts`
  (`PLAN_LIMITS`) is the single source of truth, enforced in
  `warehouse.controller.ts` / `user.service.ts` via
  `billingService.assertResourceLimit`. **AI features (waste analytics
  narrative, local events) are available on every plan** - ADR-0001
  originally proposed gating them behind Business+, but that was
  overridden; `requireFeature('ai')` is no longer wired into either
  route as a result (see `middlewares/requireFeature.ts`), though the
  `PlanLimits.aiFeatures` flag and the middleware itself stay in the
  codebase in case a future feature needs gating.

## API (v1, prefix `/api/v1`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register-company` | public | Creates a company (tenant) + its OWNER user |
| POST | `/auth/login` | public | Returns access token + sets refresh cookie. Rejected (401, same generic message as wrong password) if the account hasn't accepted its invite yet |
| POST | `/auth/accept-invite` | public (requires a valid invite token) | Sets the invited user's real password, deletes the token, logs them in (same response shape as login) |
| POST | `/auth/refresh` | refresh cookie | Rotates tokens |
| POST | `/auth/logout` | access token | Ends only the current device's session |
| GET | `/auth/me` | access token | Current user |
| GET | `/auth/sessions` | access token | List every active session (device/browser) for the caller, `isCurrent` flag on the one making the request |
| DELETE | `/auth/sessions/:id` | access token | Revoke one specific session ("log out that device") |
| DELETE | `/auth/sessions` | access token | Revoke every session, including the current one ("log out everywhere") |
| GET | `/users` | access token | List users in the caller's company. `passwordSet: false` on the response means the invite hasn't been accepted yet |
| POST | `/users` | access token, `owner`/`admin` | Creates a pending user (no password in the request) and emails them an accept-invite link. If Resend isn't configured or the send fails, the link is returned as `data.inviteLink` instead so the owner/admin can share it manually. Rejected (403) at the plan's user limit - see ADR-0001 / `billing/plan.config.ts` |
| POST | `/billing/checkout` | access token, `owner`/`admin` | Creates a Stripe Checkout Session for `{ plan: 'business' \| 'enterprise', period: 1\|3\|6\|12 }` (Basic isn't sold - it's the free default), returns `{ checkoutUrl }` to redirect to |
| POST | `/billing/portal` | access token, `owner`/`admin` | Creates a Stripe Customer Portal session (update card, cancel, view invoices), returns `{ portalUrl }`. 400 if the company has no Stripe customer yet (hasn't checked out) |
| POST | `/billing/webhook` | **none** (Stripe signature instead) | Applies `checkout.session.completed` / `invoice.payment_failed` / `invoice.payment_succeeded` / `customer.subscription.deleted` to the local `Company` mirror. Mounted outside the normal router tree with a raw body - see `app.ts` |
| GET | `/warehouses` | access token | Paginated list, supports `?page&perPage&search&isActive` |
| POST | `/warehouses` | access token, `owner`/`admin`/`manager` | Create a warehouse. Rejected (403) at the plan's warehouse limit - see ADR-0001 / `billing/plan.config.ts` |
| GET | `/warehouses/:id` | access token | Get one warehouse (tenant-scoped, 404 if not yours) |
| PATCH | `/warehouses/:id` | access token, `owner`/`admin`/`manager` | Update name/location |
| DELETE | `/warehouses/:id` | access token, `owner`/`admin` | Soft delete (sets `isActive: false`) |
| GET | `/products` | access token | Paginated list, `?page&perPage&search&category&isActive` (search matches name/SKU/barcode) |
| POST | `/products` | access token, `owner`/`admin`/`manager` | Create a product |
| GET | `/products/:id` | access token | Get one product (tenant-scoped, 404 if not yours) |
| PATCH | `/products/:id` | access token, `owner`/`admin`/`manager` | Update fields (SKU is immutable) |
| DELETE | `/products/:id` | access token, `owner`/`admin` | Soft delete (sets `isActive: false`) |
| GET | `/inventory` | access token | Paginated list, `?page&perPage&productId&warehouseId` |
| POST | `/inventory` | access token, `owner`/`admin`/`manager` | Create a stock record for a product+warehouse (both re-verified as belonging to caller's company) |
| GET | `/inventory/:id` | access token | Get one stock record (tenant-scoped) |
| PATCH | `/inventory/:id/adjust` | access token, `owner`/`admin`/`manager` | Atomically apply `quantityDelta`/`reservedDelta`; rejects if it would go negative or reserved would exceed quantity |
| GET | `/suppliers` | access token | Paginated list, `?page&perPage&search&isActive` (search matches name/contact/email/phone) |
| POST | `/suppliers` | access token, `owner`/`admin`/`manager` | Create a supplier |
| GET | `/suppliers/:id` | access token | Get one supplier (tenant-scoped, 404 if not yours) |
| PATCH | `/suppliers/:id` | access token, `owner`/`admin`/`manager` | Update fields |
| DELETE | `/suppliers/:id` | access token, `owner`/`admin` | Soft delete (sets `isActive: false`) |
| GET | `/purchases` | access token | Paginated list, `?page&perPage&supplierId&warehouseId&status` |
| POST | `/purchases` | access token, `owner`/`admin`/`manager` | Create a **draft** purchase (supplier/warehouse/every item's product re-verified as belonging to caller's company) |
| GET | `/purchases/:id` | access token | Get one purchase (tenant-scoped) |
| PATCH | `/purchases/:id` | access token, `owner`/`admin`/`manager` | Edit supplier/warehouse/items/notes — **only while status is `draft`** (409 otherwise) |
| POST | `/purchases/:id/complete` | access token, `owner`/`admin`/`manager` | `draft` → `completed`; increases `Inventory.quantity` for every line item (creates the stock record if it doesn't exist yet) |
| POST | `/purchases/:id/cancel` | access token, `owner`/`admin`/`manager` | `draft` → `cancelled`; no stock effect |
| GET | `/write-offs` | access token | Paginated list, `?page&perPage&productId&warehouseId&reason&status` |
| POST | `/write-offs` | access token (**any role, including `employee`**) | Creates a **draft** write-off (no stock change yet) |
| GET | `/write-offs/:id` | access token | Get one write-off (tenant-scoped) |
| POST | `/write-offs/:id/confirm` | access token, `owner`/`admin`/`manager` | `draft` → `confirmed`; **atomically decreases** `Inventory.quantity` in one transaction; rejects (409) if stock is no longer sufficient |
| POST | `/write-offs/:id/cancel` | access token, `owner`/`admin`/`manager` | `draft` → `cancelled`; no stock effect |
| GET | `/stock-movements` | access token | Paginated list, `?page&perPage&productId&warehouseId&type`. **Read-only** - no POST; see below |
| GET | `/stock-movements/:id` | access token | Get one movement (tenant-scoped) |
| GET | `/inventarizations` | access token | Paginated list, `?page&perPage&warehouseId&status` |
| POST | `/inventarizations` | access token (**any role, including `employee`**) | Creates a **draft** count for a warehouse; auto-includes every product in stock there unless `productIds` is given |
| GET | `/inventarizations/:id` | access token | Get one (tenant-scoped), including all items' system/counted/discrepancy |
| PATCH | `/inventarizations/:id/count` | access token (**any role, including `employee`**) | Records counted quantities for one or more items (draft only) |
| POST | `/inventarizations/:id/complete` | access token, `owner`/`admin`/`manager` | Requires every item counted; **atomically** reconciles `Inventory.quantity` to the counted value per item and logs a movement for each non-zero discrepancy |
| POST | `/inventarizations/:id/cancel` | access token, `owner`/`admin`/`manager` | `draft` → `cancelled`; no stock effect |
| GET | `/notifications` | access token | Paginated list, `?page&perPage&productId&warehouseId&type&status`. **Read-only** except resolve; see below |
| GET | `/notifications/:id` | access token | Get one (tenant-scoped) |
| PATCH | `/notifications/:id/resolve` | access token (**any role, including `employee`**) | Manually marks an open notification as resolved |
| GET | `/receipts` | access token | Paginated list, `?page&perPage&type&category&from&to` — active receipts only |
| POST | `/receipts` | access token (**any role, including `employee`**) | Multipart upload (`file` + `type`/`category`/`amount`/`date`/`notes`); JPEG/PNG/WEBP/PDF, max 10MB |
| GET | `/receipts/:id` | access token | Get one with a fresh 15-minute presigned view URL |
| PATCH | `/receipts/:id` | access token, `owner`/`admin`/`manager` | Update metadata (category/amount/date/notes) - not the file itself |
| DELETE | `/receipts/:id` | access token, `owner`/`admin`/`manager` | Soft delete (file stays in R2) |
| GET | `/companies/me` | access token | Own company profile (name, slug, city, businessType, subscriptionPlan, status) |
| PATCH | `/companies/me` | access token, `owner`/`admin` | Update name/city/businessType |
| GET | `/analytics/waste` | access token | Deterministic waste aggregation, `?from&to` (default: last 30 days) - by product, by reason, waste ratio vs. purchases |
| GET | `/analytics/waste/narrative` | access token | Same numbers plus an AI-written analysis + recommendations (calls the Anthropic API). Available on every plan |
| GET | `/local-events` | access token | AI + web search: events in the company's city that could drive foot traffic. `?refresh=true` bypasses the 7-day cache. Requires `city` set via `PATCH /companies/me` first (400 otherwise). Available on every plan |
| GET | `/reports/purchases/pdf` | access token | Streams a PDF, `?from&to&supplierId&warehouseId&status` — table + totals by supplier |
| GET | `/reports/write-offs/pdf` | access token | Streams a PDF, `?from&to&productId&warehouseId&reason&status` — table + totals by reason |
| GET | `/reports/inventarizations/pdf` | access token | Streams a PDF, `?from&to&warehouseId&status` — one row per inventarization (items/counted/large-discrepancy counts), large-discrepancy cells highlighted in red, totals by warehouse. "Large" uses the same company thresholds (`largeDiscrepancyAbsThreshold`/`Percent`) as the `inventarization_discrepancy` notification |
| GET | `/receipts` | access token | Paginated list, `?page&perPage&type&category&from&to` |

Response envelope follows `Claude.md`:
```json
{ "success": true, "data": {}, "message": "" }
{ "success": false, "error": { "code": "", "message": "" } }
```

## API Documentation (Swagger / OpenAPI)

`GET /docs` — interactive Swagger UI. `GET /docs/openapi.json` — the raw
OpenAPI 3.0 document. Both live outside `/api/v1` (they're tooling, not a
versioned API resource).

- **On by default everywhere except production** (`apiDocsEnabled` in
  `config/env.ts`) — set `ENABLE_API_DOCS=true` to force it on in prod,
  or `=false` to force it off anywhere. The docs describe every request/
  response shape in detail; no secrets are exposed, but it's more
  API-surface mapping than should be world-readable by default on a live
  deployment.
- **Built with `@asteasolutions/zod-to-openapi`**, on top of the
  project's existing Zod schemas — every `*.schema.ts` file is reused
  **as-is** for request validation in the docs (none of them were
  modified to add `.openapi()` calls); only response shapes needed new
  Zod mirrors of the `PublicX` types, in `src/openapi/responseSchemas.ts`.
  One source of truth for validation, not two schemas that could drift.
- **`src/openapi/registry.ts`** — the shared `OpenAPIRegistry`, the bearer
  JWT security scheme, and the common response shapes (`ErrorResponse`,
  `Pagination`, the `{items, pagination}` list wrapper, the
  `{success, data, message}` envelope) every endpoint reuses.
- **`src/openapi/paths/*.paths.ts`** — one file per module, each
  registering that module's actual routes (method, path, role/plan
  restrictions in the description, request schema, response schema).
  `src/openapi/generateDocument.ts` imports all of them for their
  registration side effects, then builds the final document.
- Endpoints not meaningfully documentable as a request/response pair are
  deliberately excluded: `POST /billing/webhook` (not callable by an API
  client — Stripe-Signature verification instead of a JWT, and not
  mounted under `/api/v1` the normal way, see `app.ts`).

## Assumptions made (please confirm / correct)

1. **Email is globally unique** across the whole platform (one email = one
   account in one company), not just unique per company — simplifies login
   (no need to also submit a company slug/ID). Flag if you want per-company
   scoping instead (e.g. same email usable at two different client companies).
2. **Invite flow issues a single-use, 7-day email-token link** via
   `POST /users` (no password in that request) — the invited person sets
   their own password by visiting `FRONTEND_URL/accept-invite?token=...`.
   Until then the account exists but can't log in (`passwordSet: false`).
   If Resend isn't configured (or a send fails), the link comes back in the
   API response instead so it can be shared manually — see `utils/mailer.ts`.
3. Refresh tokens are rotated and stored **per-session** in a dedicated
   `Session` collection (one row per login/device, TTL-indexed), not a
   single hashed token on `User` — this is what backs `GET/DELETE
   /auth/sessions` ("log out of all devices").
4. Password policy: min 8 chars, upper+lower+digit. Adjust if you have a
   different requirement.
5. **Warehouse deletion is soft** (`DELETE` sets `isActive: false`, record
   stays in the DB) rather than a hard delete — because future modules
   (Inventory, Stock Movements) will reference `warehouseId`, and physically
   deleting a warehouse would orphan that history. A duplicate warehouse
   `name` within the same company is rejected (409); the same name is fine
   across different companies. The same soft-delete approach is used for
   Products.
6. **Product `sku` is immutable** after creation (not present in the update
   schema) — it's treated as a stable identifier. Flag if you need to allow
   changing it.
7. **Inventory has no update/delete endpoints** — stock quantities only
   change through `PATCH /inventory/:id/adjust`, which applies an atomic,
   invariant-checked delta (never goes negative, `reserved` never exceeds
   `quantity`). This single primitive is what future Purchases (positive
   `quantityDelta`), Write-offs (negative `quantityDelta`), and
   Inventarization (correction to a counted value) modules will build on.
   There's no free-form "set quantity to X" endpoint yet by design — only
   audited deltas — since inventory changes should have provenance (which
   the future Stock Movements log will capture).
8. **Low-stock detection is implemented** — `Notification` documents of
   type `low_stock` open/dedupe/auto-resolve by comparing
   `Inventory.quantity` against `Product.minStockLevel` whenever stock
   changes (purchases, write-offs, inventarization, manual adjustment).
10. **Supplier `name` is unique per company** (same soft-delete pattern as
    Warehouses/Products) — two suppliers with an identical name in the same
    company are rejected (409); the same name is fine across companies.
11. **Purchases follow a draft → completed/cancelled workflow**, not a
    single-step create. Only `draft` purchases can be edited or cancelled;
    completing is a one-way transition that increases stock via
    `Inventory` (creating the stock record if none existed for that
    product+warehouse yet). There is no `DELETE /purchases/:id` — a
    financial/audit document like a purchase receipt shouldn't be hard
    -deleted; `cancel` is the equivalent for drafts, and a completed
    purchase can currently only be reversed by a manual inverse stock
    adjustment (a "return to supplier" flow would be a good candidate for
    a future module).
12. **Purchase completion is transactional.** The status flip to
    `completed` and every line item's stock increment run inside a single
    MongoDB session (`session.withTransaction` in
    `purchase.service.ts#completePurchase`): either the whole thing commits,
    or none of it does. If anything fails partway through, MongoDB rolls
    back the status change *and* every stock increment already applied in
    that attempt - a purchase can never end up `completed` with only some
    of its items reflected in stock. `tests/purchases.test.ts` includes a
    test that simulates a mid-transaction failure and asserts the full
    rollback. This requires MongoDB to run as a **replica set** (a
    single-node one is sufficient) - see "Running MongoDB locally" below.
13. **Write-offs follow a draft → confirmed/cancelled workflow, split by
    role**: any authenticated tenant member — **including `employee`** — can
    create a draft (they're usually the one who actually finds the damaged
    or expired stock). Only `owner`/`admin`/`manager` can confirm or cancel
    it. Creating a draft does **not** touch `Inventory` yet; confirming does,
    atomically, in one transaction (rejects with 409 if stock is no longer
    sufficient - checked at confirm time, not draft time, since stock can
    change while a draft is waiting for review). There's no `PATCH` and no
    `DELETE` on a write-off itself — `cancel` is the draft-stage equivalent
    of delete, and confirmed write-offs are immutable audit records; correct
    a mistaken confirmation via `PATCH /inventory/:id/adjust`. Only one
    product per write-off document (matches the schema shape in
    `PROJECT_DESCRIPTION.md`) — for several products, create one draft per
    product. A draft requires an existing `Inventory` record for that
    product+warehouse (404 if none exists) — you can't propose writing off
    stock that was never received.
14. **Stock Movements is a read-only, system-generated ledger** — there is
    intentionally no `POST /stock-movements`. A movement is written
    automatically, inside the same transaction as the triggering change,
    from exactly four places:
    - `purchase.service.ts#completePurchase` → one movement per line item,
      `type: "purchase"`, positive `quantityDelta`, `referenceId` = the
      Purchase's id.
    - `write-off.service.ts#confirmWriteOff` → one movement, `type:
      "write_off"`, negative `quantityDelta`, `referenceId` = the
      Write-off's id.
    - `inventory.service.ts#adjustInventory` (the service behind `PATCH
      /inventory/:id/adjust`) → one movement, `type: "manual_adjustment"`,
      `referenceId: null`, but **only when `quantityDelta !== 0`** — a
      reservation-only change (`reservedDelta` alone) doesn't move any
      physical stock, so it doesn't get logged here.
    - `inventarization.service.ts#completeInventarization` → one movement
      per item with a non-zero discrepancy, `type: "inventarization"`,
      `referenceId` = the Inventarization's id. Items where the count
      matched the system exactly produce no movement (nothing moved).

    Each movement also stores `quantityAfter` (a snapshot of the resulting
    `Inventory.quantity`), so the history is readable on its own without
    replaying every prior delta. Because the movement write shares a
    transaction with its triggering stock change, they can never drift apart
    - either both happened or neither did (`tests/stock-movements.test.ts`
    includes a rollback test for the manual-adjustment path, and
    `purchases.test.ts`, `write-offs.test.ts`, and `inventarizations.test.ts`
    each assert no orphaned movement is left behind on rollback too).
15. **Inventarization reconciles to the physical count, not a fixed delta.**
    `POST /inventarizations` snapshots each item's current
    `Inventory.quantity` as `systemQuantity` (either for the `productIds`
    given, or - if omitted - every product currently in stock at that
    warehouse). `PATCH /inventarizations/:id/count` can be called
    incrementally (e.g. as staff walk the warehouse) and computes
    `discrepancy = countedQuantity - systemQuantity` per item.
    `POST /inventarizations/:id/complete` requires every item to have a
    recorded count (422 otherwise), then - atomically - applies each
    non-zero discrepancy as a delta via the same invariant-checked
    `adjustStock` used elsewhere (so it still can't push quantity negative,
    e.g. if stock moved for unrelated reasons between counting and
    confirming). Like Write-offs, creating a draft and recording counts is
    open to **any authenticated role including `employee`**, since they're
    usually the one physically counting; confirming or cancelling is
    `owner`/`admin`/`manager` only. There's no `PATCH` to edit warehouse/
    productIds after creation and no way to add items to an existing draft
    - start a new one if the scope was wrong. The structured result of
    `GET /inventarizations/:id` (items with system/counted/discrepancy) is
    the "report" from `PROJECT_DESCRIPTION.md`; a rendered PDF version is
    deferred to the planned PDF-export feature.
16. **Notifications are entirely system-generated** — there is no
    `POST /notifications`. Two kinds:
    - **`low_stock`** is a *live* alert, not a log entry: it opens when
      `Inventory.quantity` drops to/below `Product.minStockLevel`, and
      auto-resolves the moment it rises back above — checked after **every**
      operation that changes quantity (Purchases, Write-offs, manual
      adjust, Inventarization, and even the initial `POST /inventory`
      creation). A partial unique index (`{companyId, productId,
      warehouseId, type}`, filtered to `status: "open"`) guarantees at most
      one open `low_stock` alert per product+warehouse — repeated triggers
      update its `quantity` in place (via upsert) instead of creating
      duplicates; `tests/notifications.test.ts` asserts this directly.
    - **`inventarization_discrepancy`** is a one-off alert created when
      completing an inventarization, for any item whose discrepancy is
      "large": `abs(discrepancy) >= 10` **or** `abs(discrepancy) /
      systemQuantity >= 20%` (`LARGE_DISCREPANCY_ABS_THRESHOLD` /
      `_PERCENT_THRESHOLD` in `notification.service.ts`). These thresholds
      are hardcoded, not per-company configurable yet.

    Both checks run inside the *same* transaction as the triggering stock
    change (same pattern as Stock Movements), so a notification can never
    exist for a state change that itself got rolled back. `PATCH
    /notifications/:id/resolve` lets any authenticated tenant member
    (including `employee`) manually dismiss an open notification of either
    type.
17. **All three PDF reports render via Puppeteer (headless Chrome), not
    pdfkit.** `report.html.ts` builds a self-contained HTML document per
    report (real CSS layout, not pdfkit's manual x/y text positioning) and
    hands it to `utils/htmlToPdf.ts`, which renders it to a PDF buffer via
    a single shared headless Chrome instance (launched lazily, reused for
    the process lifetime, closed on graceful shutdown in `server.ts`).
    Requires a working Chromium install in whatever environment runs this
    in production (see puppeteer's own install docs for current
    OS-package requirements - these shift across Chromium versions, so
    they're not duplicated here).
    **Cyrillic font, same as before, different mechanism**: standard fonts
    have no Cyrillic glyphs, and a minimal Docker image's Chrome has no
    guaranteed Cyrillic-capable system font either — so `report.html.ts`
    embeds **DejaVu Sans** (Regular + Bold) from `assets/fonts/` directly
    into each report's HTML as a base64 `@font-face`, read once at module
    load. Same font files, same license, same `assets/` sibling-of-`src/`
    layout requirement as before — just embedded via CSS instead of
    pdfkit's `registerFont`. **If you move or restructure the project,
    keep `assets/` as a sibling of `src/`/`dist/`, or update the relative
    path in `report.html.ts`.**
    Reports have no persistence of their own — `GET /reports/*/pdf` queries
    `Purchase`/`WriteOff`/`Inventarization` directly (capped at 2,000 records
    per report, `REPORT_MAX_RECORDS` in each repository) and resolves
    supplier/warehouse/product **names** via one unpaginated-but-capped
    fetch each (`findAllInCompany`, capped at 5,000), rather than one query
    per row. All three reports include every status by default (draft/
    completed/cancelled, etc.) with the status shown per row — filter with
    `?status=` if you only want, say, completed purchases. The
    Inventarizations report additionally recomputes "large discrepancy" per
    item straight from `isLargeDiscrepancy` (exported from
    `notification.service.ts`) against the company's own thresholds, rather
    than reading stored `Notification` documents — it stays accurate even
    if a notification was later resolved or deleted, at the cost of one
    more reason `reports` now depends on `notifications`. Testing binary
    PDF output with Supertest doesn't verify the rendered content (would
    need a PDF-parsing library) — `tests/reports.test.ts` checks the
    response is a structurally valid PDF (`%PDF` magic bytes, correct
    `Content-Type`) for both populated and empty datasets, not what text or
    colors end up on the page.
18. **A second PDF engine (Puppeteer/headless Chrome) is now in the
    codebase but not wired to any route yet** — `src/utils/htmlToPdf.ts`
    (`renderHtmlToPdf`, `closeHtmlToPdfEngine`), plus two small helpers:
    `escapeHtml.ts` and `htmlReportTemplate.ts` (a base HTML page with
    reusable table/heading CSS). This exists for a **future** report that
    needs real CSS layout (logo, multi-column design, charts) rather than
    pdfkit's manual text positioning — pdfkit remains what Purchases and
    Write-offs reports use today, and is the better fit for straightforward
    tabular reports.
    - **A single headless Chrome instance is launched lazily and shared**
      for the process lifetime (spinning up a fresh browser per request
      would add ~1s+ of overhead to every call) — `getBrowser()` in
      `htmlToPdf.ts`. `server.ts` now calls `closeHtmlToPdfEngine()` during
      graceful shutdown so no orphaned Chrome process survives a
      restart/deploy.
    - **Cyrillic needs no special handling** here (unlike pdfkit) — Chrome
      renders with normal system fonts.
    - **Always run dynamic values through `escapeHtml()`** before
      interpolating them into HTML passed to `renderHtmlToPdf` — product
      names, notes, etc. are free text and could otherwise break the layout
      or inject markup into the rendered PDF. `wrapReportHtml()` escapes
      `title`/`companyName`/`subtitle` for you already; `bodyHtml` is
      inserted raw, so escape anything dynamic that goes into it yourself.
    - **`npm install` now downloads a full Chromium binary** (the
      `puppeteer` package does this automatically, ~200+ MB) — expect a
      slower, network-heavier install than before. For a smaller Docker
      image and more control over Chrome's version/patching, consider
      switching to `puppeteer-core` (no bundled browser) plus either a
      Chrome-preinstalled base image (e.g. `ghcr.io/puppeteer/puppeteer`)
      or a system Chrome install — not done here since this isn't wired up
      yet and that decision is easier to make once there's a concrete
      report driving it.
    - Only `escapeHtml`/`wrapReportHtml` are unit-tested
      (`tests/htmlToPdf.test.ts`) — `renderHtmlToPdf` itself isn't, since
      that would mean launching a real browser in the test suite for code
      nothing calls yet; add that test once a real report uses it.
19. **Receipt photos are stored in Cloudflare R2** via
    `src/utils/objectStorage.ts`, a thin wrapper around the S3-compatible
    API. R2, AWS S3, and MinIO all speak the same protocol
    (`@aws-sdk/client-s3`), so moving providers later - the plan is R2 now,
    AWS S3 if/when needed - means changing the `R2_*` env vars and the
    `endpoint` in `objectStorage.ts`, not rewriting the module.
    - **Files are private, never publicly linked.** `GET /receipts` and
      `GET /receipts/:id` generate a fresh presigned URL (15 min expiry)
      each time via `getPresignedDownloadUrl` - there's no permanent public
      URL for a receipt, since these are financial documents.
    - **Upload goes through the API** (multipart/form-data, `multer` with
      in-memory storage, field name `file`), not a direct-to-R2 presigned
      upload - simpler to build and test end-to-end for now, at the cost of
      routing file bytes through our server. Revisit if upload volume or
      file size becomes a real concern.
    - **Type/category split**: `type` is a fixed enum (`daily_revenue` /
      `purchase` / `expense`) matching what was asked for (daily takings vs.
      purchase receipts, plus a general "other expense" bucket); `category`
      is free text (e.g. "аренда", "коммуналка") rather than a managed
      taxonomy - avoids building a full Category module before there's a
      concrete need for one.
    - **No OCR / auto-extraction of amount or date from the photo** - both
      are entered manually by whoever uploads. Automatic extraction (e.g.
      via Claude's vision capability) is a natural upgrade once this basic
      version is in use, not built now.
    - **Soft delete only** - `DELETE` deactivates the DB record but never
      calls `objectStorage.deleteObject`, so the file stays in R2. Avoids
      accidental permanent loss of a financial record; means storage cost
      accumulates over time for deleted receipts, which is an acceptable
      trade for now.
    - **Allowed types**: JPEG, PNG, WEBP, PDF (some "receipts" are scanned
      PDFs, not just photos), capped at 10MB - both enforced in
      `middlewares/upload.ts`.
    - **R2 credentials are optional in `env.ts`**, not required like
      `MONGODB_URI` - so the rest of the app (and the test suite) keeps
      working without them configured; `objectStorage.ts` throws a clear
      error only when an upload/presign is actually attempted without
      credentials set (`tests/objectStorage.test.ts` checks this directly,
      unmocked - it's the actual state of the test environment, since R2
      vars aren't part of `tests/setup.ts`). `tests/receipts.test.ts` mocks
      `objectStorage` (`vi.spyOn`) to test the HTTP layer without touching
      real R2.
20. **AI assistant is two independent features, both calling the Anthropic
    API server-side** (`ANTHROPIC_API_KEY` - a billed-by-usage key from
    [console.anthropic.com](https://console.anthropic.com/settings/keys),
    not a claude.ai login; optional in `env.ts` like the R2 vars, same
    "fails clearly at call time, doesn't block the rest of the app"
    treatment - see `tests/anthropicClient.test.ts`). Both go through
    `src/utils/anthropicClient.ts`, exported as an object
    (`anthropicClient.askClaude` / `.askClaudeForJson`) specifically so
    `vi.spyOn` can mock it reliably in tests, the same pattern already used
    for `objectStorage` - a plain named-function export doesn't mock
    reliably enough across Vite's ESM transform to bet the test suite on it.
    - **`GET /analytics/waste`** is a two-layer design: the deterministic
      layer (MongoDB aggregation over confirmed Write-offs, joined with
      Product for an estimated cost, plus completed Purchases in the same
      window for a waste-to-purchases ratio) is real numbers, no AI, and is
      exactly what `GET /analytics/waste/narrative` also returns, plus a
      `narrative` field where Claude turns those same numbers into a
      written analysis + recommendations. **The model never computes
      anything** - it's given the finished aggregation and asked to narrate
      it, specifically to avoid hallucinated figures. Defaults to the last
      30 days if `from`/`to` aren't given.
    - **`GET /local-events`** needs `Company.city` set first (`PATCH
      /companies/me` - 400 otherwise) and optionally `businessType` (free
      text, e.g. "кофейня") to make results relevant. It calls Claude with
      the `web_search_20250305` tool, asks for **strict JSON only**
      (`{"events": [...]}`), and strips ```json fences before parsing in
      case the model wraps its output anyway. Verify that tool version
      string and the `MODEL` constant in `anthropicClient.ts` against
      Anthropic's current docs occasionally - both can change.
    - **Results are cached per company for 7 days** (`LocalEventsCache`,
      one document per company, TTL-indexed so MongoDB deletes expired
      entries automatically - no cleanup job needed) so a page reload
      doesn't re-trigger a paid web-search call. `?refresh=true` forces a
      fresh call. Two companies in the same city do **not** share a cache
      entry - each pays for and gets its own (`tests/local-events.test.ts`
      checks this explicitly), since `businessType` can differ and cached
      results should always reflect what a specific company would see.
    - **`Company.city`/`businessType`** are new optional fields, settable
      at registration (`POST /auth/register-company`) or anytime after via
      the new `GET`/`PATCH /companies/me` (added this round - there was no
      company-profile endpoint before, only creation via registration).
    - Extracted `WRITE_OFF_REASON_LABELS`/`WRITE_OFF_STATUS_LABELS`
      (`write-off.labels.ts`) and `PURCHASE_STATUS_LABELS`
      (`purchase.labels.ts`) out of `report.service.ts` into their own
      files so `analytics.service.ts` could reuse the same Russian labels
      instead of duplicating them - a small DRY cleanup alongside this
      feature, not a behavior change.
21. **Multi-device sessions are now fully wired** (previously the `Session`
    model/repository existed but nothing used them - `auth.service.ts` was
    still writing a single `refreshTokenHash` straight onto `User`, which
    doesn't support "log out of all devices" at all). Every login/
    registration now creates its own `Session` row; both the access and
    refresh JWTs carry that session's id as `sid` (`jwt.ts`,
    `req.auth.sessionId`). Consequences worth knowing:
    - `POST /auth/logout` now ends **only the calling device's session** -
      other devices stay signed in. Use `DELETE /auth/sessions` to sign out
      everywhere at once.
    - Refresh rotates the token **in place** on the same session (same
      `sid`, new hash) - `sessionRepository.updateHash`. If an old,
      already-rotated refresh token is replayed, or the session was
      revoked, that one session is deleted defensively and only that
      device needs to log in again.
    - **Revocation is not instant for already-issued access tokens.**
      `authenticate` only checks the JWT signature/expiry, not the session
      table, so a revoked session's still-valid access token keeps working
      until it naturally expires (`JWT_ACCESS_EXPIRES_IN`, 15m default).
      Only the *refresh* token is checked against the session table. This
      is the standard access/refresh tradeoff (short-lived access tokens
      bound the exposure window) - full session invalidation is fast, but
      not literally instantaneous.
    - `Session` documents are TTL-indexed on `expiresAt` - MongoDB deletes
      them automatically after they'd have expired anyway, no cleanup job
      needed (same pattern as `LocalEventsCache`).
    - `User.refreshTokenHash` and the repository methods built around it
      (`findByIdWithRefreshHash`, `setRefreshTokenHash`) are gone -
      `userRepository.findById` (untenanted - the refresh flow only has a
      verified userId, not yet a companyId) replaces the one legitimate
      remaining use case.
    - `tests/auth.test.ts` gained coverage for token rotation, rotation
      replay-rejection, multi-session creation, logout-scopes-to-one-
      session, revoke-by-id, and revoke-all.
22. **`city` is now required at registration**, not optional. This has a
    real ripple effect worth knowing about if you're extending the test
    suite: **every** test file that registers a company needs to supply a
    `city` now, or registration itself 422s before the rest of the test
    runs. All existing helpers were updated to pass a default; if you add a
    new test file with its own registration helper, remember to include
    `city`. `city` can still be changed (but not unset) via `PATCH
    /companies/me` afterward.
23. **Verified the configurable discrepancy thresholds are actually wired**,
    not just present in the schema - added
    `tests/notifications.test.ts > respects a per-company custom
    discrepancy threshold`, which sets `largeDiscrepancyAbsThreshold` via
    `PATCH /companies/me` and confirms a discrepancy that would NOT flag
    under the default threshold DOES flag under the lowered custom one.
    Low-stock was always configurable per-product (`Product.minStockLevel`,
    set when creating/editing a product) - only the discrepancy threshold
    was ever hardcoded. See `company.model.ts`
    (`largeDiscrepancyAbsThreshold`/`largeDiscrepancyPercentThreshold`,
    defaults 10 units / 20%) and `notification.service.ts`
    (`flagDiscrepancyIfLarge`).
24. **Fixed a real security bug: refresh tokens were hashed with bcrypt,
    which silently truncates its input at 72 bytes.** A JWT refresh token
    is typically 200+ characters. Its `sub`/`sid` claims (identical between
    a token and its own rotated successor) come *before* the claims that
    actually differ (`iat`/`exp`/`jti`) in the JSON payload, and that
    shared prefix alone already exceeds 72 bytes - so bcrypt was hashing a
    token and its rotated successor as the same effective input.
    Concretely: after `POST /auth/refresh` rotated a session's token, the
    **old, already-superseded token kept working** - rotation wasn't
    actually revoking anything, silently defeating the "stale token reuse
    is rejected" guarantee that's the whole point of rotation. Root-caused
    via `tests/auth.test.ts > rejects reuse of an old refresh token after
    it has been rotated`, which still exists and is what would catch a
    regression here.
    - **Fix**: refresh tokens are now hashed with SHA-256
      (`src/utils/tokenHash.ts` - `hashToken`/`tokensMatch`, constant-time
      compare via `crypto.timingSafeEqual`), not bcrypt. `utils/password.ts`
      (bcrypt) is unchanged and remains correct for actual user passwords -
      those are short, human-chosen, and specifically benefit from bcrypt's
      slow, salted work factor. Refresh tokens are already high-entropy
      random-ish secrets and don't need that; they need a hash that
      considers the *entire* input, which SHA-256 does.
    - `tests/tokenHash.test.ts` directly reproduces the bug shape (two
      100+ byte strings sharing an identical 72+ byte prefix, differing
      only in a suffix) as a regression guard, rather than only relying on
      the slower, harder-to-diagnose end-to-end auth test to catch it.
    - If you're hashing any other kind of token/secret (API keys, etc.)
      anywhere in this codebase later, use `tokenHash.ts`, not
      `password.ts` - the same truncation trap applies to anything longer
      than 72 bytes.
25. **Tenant isolation is now structurally enforced, not just a
    convention** — see the Multi-tenancy section above for what
    `tenantScopePlugin.ts` actually does. Two design choices worth
    flagging explicitly:
    - It **validates, it doesn't auto-inject**. A query missing companyId
      throws instead of silently running unscoped - it does not pull a
      companyId from anywhere on your behalf. Auto-injection would need
      request-scoped context (Node's `AsyncLocalStorage`, set in
      `authenticate`), which this codebase doesn't have. That's a
      possible future upgrade if "explicit is safer" stops being the
      right tradeoff, not something already decided against.
    - The **8 existing untenanted queries** (global email lookups, the
      refresh-token flow, invite-token lookups) were audited one by one
      before the plugin went in and marked with `.setOptions({
      skipTenantScope: true })` - they're the same 8 exceptions that were
      already commented as deliberate before this plugin existed, not new
      holes opened to make the plugin fit. An unmarked query is always
      treated as a bug.

## Not yet implemented (next stages, waiting for your go-ahead)

- OCR/auto-extraction for receipt photos (amount/date from the image).
- Direct-to-R2 presigned upload (skip routing file bytes through the API)
  if upload volume ever warrants it.
- Wiring the Puppeteer engine (see point 18) up to an actual report.
- Making the local-events cache duration (7 days) and waste-analytics
  default lookback (30 days) configurable per company.
- A "sales/revenue analysis" AI feature analogous to the waste one, once
  there's a sales data source to analyze (there isn't one yet - this
  project tracks purchases/stock/write-offs, not point-of-sale revenue).
- Payments/subscriptions core flow is implemented (see "Billing &
  subscriptions" section, ADR-0001), including the 7-day grace-period
  escalation - what's still missing from that ADR: an admin-facing
  manual override (comp a plan, extend a grace period); proration
  handling for mid-cycle plan changes (Stripe's Customer Portal handles
  cancel/update-card today, but not an in-app upgrade/downgrade flow); a
  real scheduled job for the grace-period escalation instead of the
  current lazy check (only runs when company status is actually read -
  a company that stops making requests/logging in entirely never gets
  escalated this way; Stripe's own subscription cancellation is the
  actual backstop for that case).

## Running MongoDB locally (replica set required for transactions)

Purchase completion uses a MongoDB transaction, which only works against a
replica set - a plain standalone `mongod` will fail with an error like
"Transaction numbers are only allowed on a replica set member". A **single
-node** replica set is enough; you don't need multiple servers.

**Docker (recommended for local dev):**
```bash
docker run -d --name inventory-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec -it inventory-mongo mongosh --eval "rs.initiate()"
```
Then set `MONGODB_URI=mongodb://localhost:27017/inventory_management?replicaSet=rs0`.

**Local `mongod` install:**
```bash
mongod --replSet rs0 --dbpath /path/to/your/data
# in another terminal, once it's up:
mongosh --eval "rs.initiate()"
```

**MongoDB Atlas:** already runs as a replica set by default - no changes
needed, just use the connection string Atlas gives you.

The test suite doesn't need any of this set up locally - it spins up its own
temporary single-node replica set automatically via `mongodb-memory-server`
(see `tests/setup.ts`).

## Notes on this delivery

Dependencies could not be `npm install`-ed or type-checked in the sandbox this
was built in (no network access there) — please run `npm install && npm run
build && npm test` locally as the first step to confirm everything compiles
and the test suite (auth flow, tenant isolation, RBAC) passes.
