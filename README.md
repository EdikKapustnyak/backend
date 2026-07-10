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
│   ├── purchases/            # draft → completed/cancelled receipts; completion increases stock
│   └── write-offs/           # immutable audit record; creation atomically decreases stock
├── middlewares/            # authenticate, requireRole, enforceTenant, validate,
│                            # isValidId, errorHandler, notFoundHandler,
│                            # rateLimiter, securityHeaders
├── errors/                 # AppError + typed subclasses
├── utils/                  # jwt, password hashing, pagination, objectId (Zod), etc.
└── types/                  # Express Request augmentation (req.auth)
tests/
├── setup.ts               # in-memory MongoDB replica-set lifecycle for tests
├── auth.test.ts            # auth flow + multi-tenant isolation + RBAC tests
├── warehouses.test.ts       # warehouse CRUD + tenant isolation + RBAC + pagination
├── products.test.ts         # product CRUD + unique SKU/barcode + search + RBAC
├── inventory.test.ts         # stock create/adjust + FK tenant checks + RBAC
├── suppliers.test.ts          # supplier CRUD + unique name + search + RBAC
├── purchases.test.ts           # draft/complete/cancel workflow + stock increase + RBAC + transaction rollback
└── write-offs.test.ts           # draft/confirm/cancel workflow + role split + transaction rollback
```

Each future domain module (`stock-movements`) should follow the same shape
as `write-offs/`: `*.model.ts`, `*.repository.ts`, `*.service.ts`,
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
| GET | `/write-offs` | access token | Paginated list, `?page&perPage&productId&warehouseId&reason&status` |
| POST | `/write-offs` | access token (**any role, including `employee`**) | Creates a **draft** write-off (no stock change yet) |
| GET | `/write-offs/:id` | access token | Get one write-off (tenant-scoped) |
| POST | `/write-offs/:id/confirm` | access token, `owner`/`admin`/`manager` | `draft` → `confirmed`; **atomically decreases** `Inventory.quantity` in one transaction; rejects (409) if stock is no longer sufficient |
| POST | `/write-offs/:id/cancel` | access token, `owner`/`admin`/`manager` | `draft` → `cancelled`; no stock effect |

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

## Not yet implemented (next stages, waiting for your go-ahead)

- Stock Movements, Inventarization, Notifications modules.
- Refresh-token/session table for multi-device logout.
- Email delivery for invites.

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
