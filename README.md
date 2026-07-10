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
src/
├── server.ts            # entry point: DB connect, listen, graceful shutdown
├── app.ts                # Express app: middleware pipeline, routes, error handler
├── config/                # env validation (Zod), DB connection
├── modules/
│   ├── auth/               # register-company, login, refresh, logout, me
│   ├── users/               # tenant-scoped user management (invite, list)
│   ├── companies/            # company (tenant) model + repository
│   ├── warehouses/           # tenant-scoped warehouse CRUD (soft delete)
│   ├── products/             # tenant-scoped product catalog (soft delete)
│   ├── inventory/            # stock levels per product+warehouse (quantity/reserved)
│   ├── suppliers/            # tenant-scoped supplier directory (soft delete)
│   └── purchases/            # draft → completed/cancelled receipts; completion increases stock
├── middlewares/            # authenticate, requireRole, enforceTenant, validate,
│                            # isValidId, errorHandler, notFoundHandler,
│                            # rateLimiter, securityHeaders
├── errors/                 # AppError + typed subclasses
├── utils/                  # jwt, password hashing, pagination, objectId (Zod), etc.
└── types/                  # Express Request augmentation (req.auth)
tests/
├── setup.ts               # in-memory MongoDB lifecycle for tests
├── auth.test.ts            # auth flow + multi-tenant isolation + RBAC tests
├── warehouses.test.ts       # warehouse CRUD + tenant isolation + RBAC + pagination
├── products.test.ts         # product CRUD + unique SKU/barcode + search + RBAC
├── inventory.test.ts         # stock create/adjust + FK tenant checks + RBAC
├── suppliers.test.ts          # supplier CRUD + unique name + search + RBAC
└── purchases.test.ts           # draft/complete/cancel workflow + stock increase + RBAC
```

Each future domain module (`write-offs`, `stock-movements`) should follow the
same shape as `purchases/`: `*.model.ts`, `*.repository.ts`, `*.service.ts`,
`*.controller.ts`, `*.routes.ts`, `*.schema.ts`, `*.types.ts`.

## Multi-tenancy — how isolation is enforced

- Every protected route runs through `authenticate`, which verifies the JWT
  and attaches a trusted `req.auth = { userId, companyId, role }`.
- **`companyId` is never read from the request body, params, or query** in any
  controller or service — only from `req.auth.companyId`, which comes from the
  signed token. This is what prevents tenant spoofing.
- `enforceTenant` middleware is available as a second line of defense for
  nested routes that also carry a `:companyId` param.
- Every Mongoose query that touches tenant data must include `companyId` (see
  `user.repository.ts` for the pattern to replicate in future modules).

## RBAC

Roles (`src/modules/users/user.types.ts`): `owner > admin > manager > employee`.
`requireRole(...)` middleware restricts routes; the first user of a company
(created via `register-company`) is always `owner` and cannot be reassigned
through the invite endpoint.

## API (v1, prefix `/api/v1`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register-company` | public | Creates a company (tenant) + its OWNER user |
| POST | `/auth/login` | public | Returns access token + sets refresh cookie |
| POST | `/auth/refresh` | refresh cookie | Rotates tokens |
| POST | `/auth/logout` | access token | Revokes refresh session |
| GET | `/auth/me` | access token | Current user |
| GET | `/users` | access token | List users in the caller's company |
| POST | `/users` | access token, `owner`/`admin` | Invite a new user into the caller's company |
| GET | `/warehouses` | access token | Paginated list, supports `?page&perPage&search&isActive` |
| POST | `/warehouses` | access token, `owner`/`admin`/`manager` | Create a warehouse |
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

Response envelope follows `Claude.md`:
```json
{ "success": true, "data": {}, "message": "" }
{ "success": false, "error": { "code": "", "message": "" } }
```

## Assumptions made (please confirm / correct)

1. **Email is globally unique** across the whole platform (one email = one
   account in one company), not just unique per company — simplifies login
   (no need to also submit a company slug/ID). Flag if you want per-company
   scoping instead (e.g. same email usable at two different client companies).
2. **Invite flow issues the password directly** via `POST /users` rather than
   sending an email invite link with a signup token — simplest thing that
   works for now; swap for an email-token flow later if needed.
3. Refresh tokens are rotated and a single **hashed refresh token per user**
   is stored (not a full multi-device session table) — sufficient for v1,
   would need a `sessions` collection for "log out of all devices" /
   multi-device session listing later.
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
8. **Low-stock detection is not implemented yet** — `Product.minStockLevel`
   is stored but nothing currently compares it against `Inventory.quantity`;
   that comparison belongs to the future Notifications module.
9. **Supplier `name` is unique per company** (same soft-delete pattern as
   Warehouses/Products) — two suppliers with an identical name in the same
   company are rejected (409); the same name is fine across companies.
10. **Purchases follow a draft → completed/cancelled workflow**, not a
    single-step create. Only `draft` purchases can be edited or cancelled;
    completing is a one-way transition that increases stock via
    `Inventory` (creating the stock record if none existed for that
    product+warehouse yet). There is no `DELETE /purchases/:id` — a
    financial/audit document like a purchase receipt shouldn't be hard
    -deleted; `cancel` is the equivalent for drafts, and a completed
    purchase can currently only be reversed by a manual inverse stock
    adjustment (a "return to supplier" flow would be a good candidate for
    a future module).
11. **⚠️ Purchase completion is NOT wrapped in a MongoDB transaction.** The
    status flip to `completed` and each line item's stock increment are
    separate operations. On a standalone (non-replica-set) MongoDB - the
    default for local dev and for this test suite - multi-document
    transactions aren't available. If the process crashes mid-way through
    a multi-item purchase's completion, the purchase could end up marked
    `completed` with only some items' stock applied. To close this gap:
    run MongoDB as a single-node replica set and wrap
    `purchase.service.ts#completePurchase` in a `session.withTransaction`
    block. Flag if you want this added now — it's a real gap worth taking
    seriously before this goes near production, just scoped out of this
    stage to avoid changing the shared test DB setup without your sign-off.

## Not yet implemented (next stages, waiting for your go-ahead)

- Write-offs, Stock Movements, Inventarization, Notifications modules.
- Refresh-token/session table for multi-device logout.
- Email delivery for invites.
- Transactional guarantee for multi-step stock operations (see point 11
  above) — recommended before production use.

## Notes on this delivery

Dependencies could not be `npm install`-ed or type-checked in the sandbox this
was built in (no network access there) — please run `npm install && npm run
build && npm test` locally as the first step to confirm everything compiles
and the test suite (auth flow, tenant isolation, RBAC) passes.
