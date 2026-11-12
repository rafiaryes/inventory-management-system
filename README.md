# Inventory Management System (IMS)

A full-stack single-warehouse Inventory Management System built with a **Modular Monolith** backend in **Elysia.js + Bun + PostgreSQL 18** and a **Next.js + TypeScript + Tailwind CSS** frontend, structured as a Bun Workspaces monorepo.

---

## 1. Project Overview

Inventory Management System (IMS) manages warehouse product catalogs, categories, users, stock-in/stock-out transactions, immutable stock movement history, and monthly inventory metrics for a single warehouse.

The codebase prioritizes backend data integrity, transactional concurrency safety, strict runtime input validation, database-backed session authentication, and backend-enforced Role-Based Access Control (RBAC).

Authoritative design specifications live in [`docs/`](./docs):

- [`AGENTS.md`](./AGENTS.md) — engineering constraints and implementation rules
- [`docs/PRD.md`](./docs/PRD.md) — product requirements and MVP scope
- [`docs/architecture.md`](./docs/architecture.md) — Modular Monolith architecture and module boundaries
- [`docs/database-design.md`](./docs/database-design.md) — PostgreSQL schema, constraints, and locking strategy
- [`docs/api-contract.md`](./docs/api-contract.md) — HTTP endpoints, schemas, status codes, and error contracts

---

## 2. Key Features

- **Database-Backed Authentication:** Cookie-based session authentication (`ims_session`) using Argon2id password hashing, 7-day absolute session expiration, and explicit session revocation.
- **Role-Based Access Control (`admin` & `staff`):** Enforced on backend routes, services, and DTO serialization, paired with role-aware frontend navigation and route guards.
- **User Management (Admin):** Create users, update profile/role, activate/deactivate accounts, and reset passwords (revoking all active user sessions atomically). Includes self-modification and last-active-admin protection.
- **Category Management:** Case-insensitive unique category names, search/filter/sort pagination, activation/deactivation without deleting historical product links.
- **Product Catalog:** Normalized uppercase SKUs (`^[A-Z0-9-]+$`), lowercase units, count-only integer unit enforcement (`pcs`, `unit`, `box`, `pack`, `set`) vs. 3-decimal unit precision, `current_stock = 0` on creation, and transactional unit-change guards.
- **Atomic Stock In & Stock Out:** Row-locked (`SELECT ... FOR UPDATE`) stock updates paired with immutable `stock_movements` records inside a single database transaction, mandatory transaction `reason`, and exact `BigInt` decimal arithmetic.
- **Stock Movement History:** Filterable and sortable immutable audit trail of all stock inflows and outflows, retaining historical entries even after product deactivation.
- **Inventory Dashboard:** Active product/category counts, low-stock alerts (`currentStock <= minimumStock` ordered by deficit), current calendar-month Stock In/Out counts calculated in `BUSINESS_TIMEZONE` (`Asia/Jakarta`), and the 10 most recent movements.

---

## 3. User Roles & Permissions

Role values are lowercase (`admin` and `staff`).

| Capability | `admin` | `staff` |
|---|---|---|
| View dashboard (`GET /api/v1/dashboard`) | Yes | Yes |
| Manage users (`/api/v1/users/*`) | Yes | No (`403 FORBIDDEN`) |
| Create, edit, activate/deactivate categories & products | Yes | No (`403 FORBIDDEN`) |
| View/filter inactive categories or inactive products | Yes | No (`403 FORBIDDEN`) |
| View `purchasePrice` & `sellingPrice` | Yes | **No** |
| Sort products by `purchasePrice`, `sellingPrice`, or `status` | Yes | No (`403 FORBIDDEN`) |
| Record Stock In / Stock Out (`POST /api/v1/stock-movements`) | Yes | Yes (active products only) |
| View stock movement history (including deactivated products) | Yes | Yes (price-free) |

Price isolation is enforced in the backend DTO layer (`toProductDtoForRole`), not merely hidden in the UI: `ProductStaffDto` omits `purchasePrice` and `sellingPrice` fields entirely.

---

## 4. Technology Stack

| Layer | Technology |
|---|---|
| Monorepo | Bun Workspaces (`bun@1.4.3`) |
| Frontend | Next.js (`16.4.6`, App Router), React (`19.3.0`), TypeScript, Tailwind CSS (`4.3.3`) |
| Backend | Elysia.js (`1.4.30`, `normalize: false`), Bun runtime, TypeScript |
| Database & ORM | PostgreSQL 18, Drizzle ORM (`drizzle-orm`), Postgres.js (`postgres`), Drizzle Kit |
| Auth & Crypto | Database-backed sessions, SHA-256 token hashing (`node:crypto`), Argon2id (`Bun.password`) |
| API Documentation | OpenAPI / Swagger via `@elysiajs/openapi` |
| API Testing | Bruno collection (`bruno/`) |

---

## 5. Architecture Overview

The backend is implemented as a **Modular Monolith** (not microservices). A single Elysia HTTP process exposes `/api/v1` and operational health probes (`/health`, `/health/db`), structured internally into infrastructure plugins and domain modules with clear `route → service → repository` separation.

```mermaid
flowchart LR
    FE["Next.js Frontend (App Router)"] -->|"HTTPS/HTTP + HttpOnly Cookie (credentials: include)"| Plugins["Elysia Core Plugins (Request ID, Error Handler, CORS, CSRF, Auth Guard)"]
    Plugins --> Auth["auth module"]
    Plugins --> Users["users module"]
    Plugins --> Categories["categories module"]
    Plugins --> Products["products module"]
    Plugins --> Stock["stock-movements module"]
    Plugins --> Dashboard["dashboard module"]
    Auth --> DB[("PostgreSQL 18 (Drizzle ORM + Postgres.js)")]
    Users --> DB
    Categories --> DB
    Products --> DB
    Stock --> DB
    Dashboard --> DB
```

See [`apps/backend/README.md`](./apps/backend/README.md) and [`apps/frontend/README.md`](./apps/frontend/README.md) for per-application details.

---

## 6. Repository Structure

```text
inventory-management-system/
├── AGENTS.md
├── bunfig.toml                 # Root Bun test preload (DB isolation guard) & timeout
├── package.json                # Root workspace scripts
├── bruno/                      # Ordered Bruno API collection (54 HTTP requests)
│   ├── 01-health/
│   ├── 02-auth-and-negative/
│   ├── 03-admin-flow/
│   ├── 04-staff-flow/
│   └── environments/
├── docs/                       # PRD, architecture, database design, API contract
└── apps/
    ├── backend/                # Elysia.js + Drizzle ORM Modular Monolith
    │   ├── drizzle/            # Generated SQL migrations (0000_sudden_wonder_man.sql)
    │   ├── src/
    │   │   ├── common/         # Shared decimal, error, HTTP, pagination, security, timezone helpers
    │   │   ├── config/         # Startup environment parsing & validation
    │   │   ├── db/             # Drizzle client, schema tables, seed script
    │   │   ├── modules/        # auth, users, categories, products, stock-movements, dashboard
    │   │   └── plugins/        # auth, cors, csrf, error-handler, openapi, request-id
    │   └── tests/              # Isolated PostgreSQL integration & unit test suites
    └── frontend/               # Next.js App Router + Tailwind CSS application
        ├── src/
        │   ├── app/            # Login & protected routes (/dashboard, /products, /categories, /stock-movements, /users)
        │   ├── components/     # Auth guard/provider, app shell, shared UI components
        │   ├── features/       # Domain views & modals
        │   ├── lib/            # API client, env config, formatting, reference helpers
        │   ├── services/       # Typed API endpoint wrappers
        │   └── types/          # Shared TypeScript DTO & API error contracts
        └── tests/              # Helper, service, and SSR component render tests
```

---

## 7. Database Overview

PostgreSQL 18 stores five core tables managed via Drizzle ORM and SQL migration [`apps/backend/drizzle/0000_sudden_wonder_man.sql`](./apps/backend/drizzle/0000_sudden_wonder_man.sql):

- `users`: accounts with lowercase unique normalized email index, Argon2id `password_hash`, `role` check (`admin` | `staff`), and `is_active`.
- `sessions`: 64-character SHA-256 `token_hash` unique index, `expires_at`, `revoked_at`, FK to `users` (`ON DELETE RESTRICT`).
- `categories`: case-insensitive normalized unique category name index, `description`, `is_active`.
- `products`: normalized uppercase unique `sku`, `category_id` FK (`ON DELETE RESTRICT`), `unit`, `purchase_price` (`NUMERIC(14,2)`), `selling_price` (`NUMERIC(14,2)`), `current_stock` (`NUMERIC(14,3)`), `minimum_stock` (`NUMERIC(14,3)`), `status` check (`active` | `inactive`).
- `stock_movements`: immutable movement ledger (`in` | `out`), `quantity`, `stock_before`, `stock_after` (`NUMERIC(14,3)`), non-empty `reason`, `notes`, FKs to `products` and `users` (`ON DELETE RESTRICT`), and database `CHECK` constraints enforcing valid stock arithmetic.

All primary keys use PostgreSQL `gen_random_uuid()`, timestamps use `TIMESTAMPTZ`, and `updated_at` is explicitly updated by the application layer inside transactions rather than database triggers.

---

## 8. Authentication & Security

- **Session Tokens:** Cryptographically random tokens (≥32 bytes, `base64url`) are delivered via `HttpOnly` cookies (`SameSite=Lax` by default; `SameSite=None` requires `COOKIE_SECURE=true`). Only the 64-character SHA-256 hex digest is persisted in `sessions`.
- **Absolute Expiry & Revocation:** Sessions expire strictly 7 days after creation (`SESSION_TTL_DAYS`) with no sliding extension. Deactivating a user or resetting a password revokes all active sessions for that user in the same database transaction.
- **Rate Limiting & Trusted Proxies:** `POST /api/v1/auth/login` uses an in-memory bounded LRU rate limiter (`DEFAULT_MAX_BUCKETS = 10_000`) protecting blocked buckets from flood eviction. Client IP resolution validates `TRUSTED_PROXY_IPS` CIDR ranges and traverses `X-Forwarded-For` right-to-left, failing closed (`503`) in `production` if no socket peer IP is available.
- **CORS & CSRF Protection:** Explicit origin allowlist (`CORS_ALLOWED_ORIGINS`, wildcards rejected when credentials are enabled) plus `Origin`/`Referer` verification on `POST`, `PATCH`, `PUT`, and `DELETE` requests.
- **Concurrency & Deadlock Protection:**
  - Stock In/Out locks the target product row with `SELECT ... FOR UPDATE` inside one transaction before verifying status, unit precision, available stock, or max stock bounds (`99999999999.999`).
  - Admin membership changes (`create` admin, `role` update, `isActive` toggle) acquire a transaction-level PostgreSQL advisory lock (`pg_advisory_xact_lock`) before row locks (`ORDER BY id ASC FOR UPDATE`) to serialize concurrent admin changes and prevent AB-BA deadlocks while preserving at least one active admin.
- **Strict Runtime Validation:** Elysia runs with `normalize: false` and TypeBox `additionalProperties: false` so unexpected properties and malformed payloads return `400 VALIDATION_ERROR`.

---

## 9. Getting Started

### Prerequisites

- **Bun** (`1.4.x`, workspace configured with `bun@1.4.3`)
- **PostgreSQL 18** running locally (with two databases for development and isolated testing, e.g., `inventory_management` and `inventory_management_test`)

### Installation

```bash
bun install
```

---

## 10. Environment Configuration

Create environment files from the provided templates (never commit `.env` or real credentials):

1. Backend environment (`apps/backend/.env` copied from [`apps/backend/.env.example`](./apps/backend/.env.example)):

```dotenv
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/inventory_management
DATABASE_URL_TEST=postgresql://postgres:YOUR_PASSWORD@localhost:5432/inventory_management_test
BUSINESS_TIMEZONE=Asia/Jakarta

CORS_ALLOWED_ORIGINS=http://localhost:3000
SESSION_COOKIE_NAME=ims_session
SESSION_TTL_DAYS=7
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
TRUSTED_PROXY_IPS=
LOGIN_RATE_LIMIT_MAX=10
LOGIN_RATE_LIMIT_WINDOW_SECONDS=900
ENABLE_SWAGGER=true

SEED_ADMIN_NAME=System Administrator
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=CHANGE_ME_MIN_8_CHARS
```

2. Frontend environment (`apps/frontend/.env.local` copied from [`apps/frontend/.env.example`](./apps/frontend/.env.example)):

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

---

## 11. Database Migration

Apply migrations and verify schema parity from the repository root:

```bash
# Migrate development/application database (uses DATABASE_URL)
bun run db:migrate

# Migrate isolated test database (uses DATABASE_URL_TEST; refuses non-*_test DBs)
bun run db:migrate:test

# Verify Drizzle schema matches generated SQL migrations
bun run db:check

# Optional development seed (initial Admin + 3 default categories; blocked in production)
bun run db:seed
```

---

## 12. Running the Application

Run both backend (`http://localhost:3001`) and frontend (`http://localhost:3000`) concurrently in development mode:

```bash
bun run dev
```

Or run each workspace individually:

```bash
bun run dev:backend
bun run dev:frontend
```

Build both workspaces for verification:

```bash
bun run build
```

---

## 13. Running Tests

Backend integration tests enforce database isolation via [`apps/backend/tests/setup.ts`](./apps/backend/tests/setup.ts) (preloaded by both [`apps/backend/bunfig.toml`](./apps/backend/bunfig.toml) and root [`bunfig.toml`](./bunfig.toml)): `DATABASE_URL_TEST` must point to a dedicated database whose name ends with `_test` (such as `inventory_management_test`). Tests refuse to connect to `inventory_management`.

```bash
# Run all backend and frontend tests
bun run test

# Run individually
bun run test:backend
bun run test:frontend

# Type checking and frontend linting
bun run typecheck
bun run lint:frontend
```

---

## 14. API Documentation

When `ENABLE_SWAGGER=true` (default when `NODE_ENV=development`; disabled by default in `production`), interactive OpenAPI/Swagger documentation is mounted on the backend at:

- `GET /docs` — Swagger/OpenAPI UI
- `GET /docs/json` — OpenAPI JSON specification

The normative endpoint specification is documented in [`docs/api-contract.md`](./docs/api-contract.md).

---

## 15. Bruno API Testing

The [`bruno/`](./bruno/README.md) directory contains **54 HTTP requests** organized across four sequential execution folders (`seq: 1..4`):

1. `01-health/` — `/health` and `/health/db`
2. `02-auth-and-negative/` — unauthenticated `401`, invalid credentials, unknown-field `400`, Admin login & dynamic fixture initialization
3. `03-admin-flow/` — Admin CRUD for users, categories, products, Stock In/Out, dashboard check, deactivation edge cases, Admin logout
4. `04-staff-flow/` — Staff login, RBAC `403` guards, price-free product/movement responses, historical movements on inactive products, Staff logout

Passwords belong in Bruno `vars:secret` inside `bruno/environments/local.bru` (or `--env-var` flags when running via Bruno CLI) and are not stored in Git. Always point the backend `DATABASE_URL` to a non-production/test database before executing the collection.

---

## 16. Current Limitations

- **Single-Instance Rate Limiter:** Login rate limiting uses an in-memory `Map` per process (no Redis in MVP); multi-instance horizontal scaling would maintain independent counters per instance.
- **Non-Idempotent Stock Mutations:** `POST /api/v1/stock-movements` does not implement `Idempotency-Key`; clients must avoid automatic retries on ambiguous network timeouts (`X-Request-ID` is used for diagnostics only).
- **Transaction-Start Timestamp Semantics:** `updated_at` and `stock_movements.created_at` currently use PostgreSQL `NOW()` (`transaction_timestamp()`), meaning under high lock contention a transaction that waits longer for a row/advisory lock can record an earlier timestamp than a concurrent transaction that began later and committed sooner.
- **Frontend Test Coverage Scope:** Automated frontend tests (`bun run test:frontend`) validate helpers, service wrappers, error handling, and static `renderToStaticMarkup` output rather than live browser DOM click/input events.
- **Single-Warehouse MVP Scope:** Multi-warehouse, supplier management, purchase/sales orders, barcode scanning, and standalone stock adjustments are excluded from the MVP.

---

## 17. Future Improvements

- Replace the in-memory login rate limiter with a shared store (such as Redis) if deploying multiple backend instances.
- Add optional `Idempotency-Key` support for `POST /api/v1/stock-movements` to make client retries safe across unstable networks.
- Evaluate `clock_timestamp()` after lock acquisition if strict post-lock chronological ordering of `updated_at` / `stock_movements.created_at` is required under heavy concurrency.
- Add end-to-end browser automation (e.g., Playwright) for interactive frontend flows alongside existing backend integration tests.
