# IMS Backend (`apps/backend`)

Backend service for the Inventory Management System (IMS), built with **Elysia.js**, **Bun**, **TypeScript**, **Drizzle ORM**, **Postgres.js**, and **PostgreSQL 18** using a **Modular Monolith** architecture.

---

## 1. Backend Overview

The backend exposes versioned business APIs under `/api/v1`, operational probes outside API versioning (`GET /health`, `GET /health/db`), and optional OpenAPI documentation (`/docs`, `/docs/json`).

Key implementation goals:

- Strict structural validation (`normalize: false` + `additionalProperties: false` → `400 VALIDATION_ERROR`)
- Explicit separation of HTTP routes, business rules, data access, and schema validation
- Backend-enforced RBAC (`admin` vs. `staff`), including DTO-level omission of prices for Staff
- Row-locked and advisory-locked PostgreSQL transactions for stock and admin membership integrity

---

## 2. Technology Stack

| Dependency / Tool | Purpose |
|---|---|
| `bun` | TypeScript runtime, Argon2id hashing (`Bun.password`), test runner, bundler |
| `elysia` (`1.4.30`) | HTTP framework and TypeBox schema validation |
| `@elysiajs/cors` (`^1.4.3`) | Credentialed explicit-allowlist CORS middleware |
| `@elysiajs/openapi` (`^1.4.17`) | OpenAPI/Swagger specification & UI |
| `drizzle-orm` (`^0.45.4`) + `drizzle-kit` (`^0.31.11`) | Type-safe query builder, schema definitions, SQL migrations |
| `postgres` (`^4.1.1`) | Postgres.js database driver |

---

## 3. Backend Architecture

Entrypoints and cross-cutting layers live directly under [`src/`](./src):

- [`src/index.ts`](./src/index.ts) — loads validated env config, starts `createApp(env).listen(...)`, and handles graceful `SIGINT`/`SIGTERM` shutdown (closing HTTP server and PostgreSQL pool).
- [`src/app.ts`](./src/app.ts) — wires Elysia (`normalize: false`), core plugins, `/health`, `/health/db`, and the `/api/v1` module group.
- [`src/config/env.ts`](./src/config/env.ts) — parses and validates startup environment variables (fails fast on invalid URLs, wildcard CORS, unconfigured `COOKIE_SECURE` with `SameSite=None`, invalid `TRUSTED_PROXY_IPS` CIDRs, or invalid IANA timezones).
- [`src/plugins/`](./src/plugins):
  - `request-id.ts` — assigns or propagates `X-Request-ID`.
  - `error-handler.ts` — maps `AppError`, Elysia `VALIDATION` / `PARSE` (`400`), `NOT_FOUND` (`404`), and `INVALID_COOKIE_SIGNATURE` (`401`), while redacting secrets in unexpected error logs.
  - `cors.ts` — enforces `CORS_ALLOWED_ORIGINS` with `credentials: true` (`GET`, `POST`, `PATCH`, `OPTIONS`) and exposes `X-Request-ID` & `Retry-After`.
  - `csrf.ts` — validates `Origin` (or fallback `Referer`) against the allowlist on `POST`, `PATCH`, `PUT`, and `DELETE` requests when browser origin headers are present.
  - `auth.ts` — resolves `ims_session` cookie, verifies active non-revoked/non-expired session, and provides `requireAuth` and `requireRole` guards via `WeakMap<Request, AuthContextUser>`.
  - `openapi.ts` — mounts `/docs` and `/docs/json` only when `ENABLE_SWAGGER=true`.
- [`src/common/`](./src/common) — `db-errors.ts` (`23505`, `23503`, `40P01` helpers), `decimal.ts` (`BigInt` scaled decimal parsing/formatting), `errors.ts` (`ERROR_CODES`), `http.ts` (`successResponse` & error schemas), `pagination.ts`, `security.ts` (token/hash, IP/CIDR, XFF, log redaction), and `timezone.ts` (`Asia/Jakarta` calendar-month UTC boundaries).

---

## 4. Module Structure

Each domain module under [`src/modules/`](./src/modules) follows `route` → `service` → `repository` + `schema` + `types`:

| Module | Directory | Responsibility |
|---|---|---|
| **Auth** | [`src/modules/auth/`](./src/modules/auth) | Login (`POST /auth/login`), current session lookup (`GET /auth/me`), logout (`POST /auth/logout`), dummy-hash timing mitigation, in-memory login rate limiter |
| **Users** | [`src/modules/users/`](./src/modules/users) | Admin-only user listing, creation, profile/role update, activation/deactivation, password reset with session revocation |
| **Categories** | [`src/modules/categories/`](./src/modules/categories) | Category listing (Admin sees all; Staff sees active only or receives `403`), creation, metadata update, activation/deactivation |
| **Products** | [`src/modules/products/`](./src/modules/products) | Product catalog CRUD/status, SKU/unit normalization, role-scoped DTO projection (`ProductAdminDto` vs. `ProductStaffDto`), Staff query/sort guards |
| **Stock Movements** | [`src/modules/stock-movements/`](./src/modules/stock-movements) | Atomic Stock In & Stock Out creation (`POST /stock-movements`) and immutable movement history queries (`GET /stock-movements`, `GET /stock-movements/:id`) |
| **Dashboard** | [`src/modules/dashboard/`](./src/modules/dashboard) | Price-free summary metrics, low-stock ordering, timezone-aware monthly Stock In/Out counts, and 10 recent movements (`GET /dashboard`) |

---

## 5. Authentication & Session Management

- **Password Hashing:** Argon2id via `Bun.password.hash(..., { algorithm: "argon2id" })`.
- **Tokens & Storage:** `generateSessionToken(32)` creates 32 random bytes (`base64url`); only the 64-character SHA-256 hex digest is stored in `sessions.token_hash`.
- **Cookie Settings:** `HttpOnly: true`, `Path: /`, `SameSite` configured via `COOKIE_SAME_SITE` (default `lax`), `Secure` configured via `COOKIE_SECURE` (defaults to `true` when `NODE_ENV=production`).
- **Session Lifetime & Revocation:** `sessions.expires_at` is calculated in PostgreSQL (`NOW() + make_interval(days => ttlDays)`) with no sliding extension. `POST /auth/logout` revokes only the active session; user deactivation or password reset revokes all active sessions for that user in the same transaction (and self-password-reset clears the caller cookie).
- **Trusted Proxy & Rate Limiter:**
  - `extractClientIp` in [`src/common/security.ts`](./src/common/security.ts) trusts `X-Forwarded-For` (right-to-left traversal) or `X-Real-IP` **only** when the peer socket IP matches `TRUSTED_PROXY_IPS` CIDRs.
  - When `clientIp` is `null`, `POST /api/v1/auth/login` fails closed with HTTP `503` in `production`, and isolates fallback rate-limit keys per email (`email-no-ip:`) in non-production environments.
  - `createLoginRateLimiter` ([`src/modules/auth/auth.rate-limiter.ts`](./src/modules/auth/auth.rate-limiter.ts)) caps memory at `DEFAULT_MAX_BUCKETS = 10_000` with LRU ordering and protects blocked buckets (`count >= maxAttempts`) from flood eviction.
  - **Multi-instance limitation:** The rate limiter stores counters in process memory. In horizontally scaled multi-instance deployments, each backend instance enforces limits independently.

---

## 6. Authorization & RBAC

- All `/api/v1` endpoints except `POST /api/v1/auth/login` require a valid session (`requireAuth`).
- `/api/v1/users/*` and all category/product mutations require `admin` (`requireRole("admin")`, returning `403 FORBIDDEN` for `staff`).
- Category/product read routes allow `admin` and `staff`, but `staff` requests explicitly asking for inactive records (`isActive=false`, `status=inactive`, `status=all`), querying an inactive product/category detail, or sorting products by `purchasePrice`, `sellingPrice`, or `status` are rejected with `403`.
- [`toProductDtoForRole`](./src/modules/products/products.service.ts) omits `purchasePrice` and `sellingPrice` for `staff` on the server.

---

## 7. Database & ORM

- Schema files live in [`src/db/schema/`](./src/db/schema) (`users.ts`, `sessions.ts`, `categories.ts`, `products.ts`, `stock-movements.ts`, `relations.ts`).
- Initial SQL migration: [`drizzle/0000_sudden_wonder_man.sql`](./drizzle/0000_sudden_wonder_man.sql).
- Enforces `NUMERIC(14,2)` prices, `NUMERIC(14,3)` stock/quantities, `TIMESTAMPTZ` UTC storage, `ON DELETE RESTRICT` across all foreign keys, normalized unique indexes, and PostgreSQL `CHECK` constraints.
- [`src/db/index.ts`](./src/db/index.ts) and [`drizzle.config.ts`](./drizzle.config.ts) enforce safety guards refusing to run `NODE_ENV=test` or `DRIZZLE_USE_TEST_DB=true` commands against `inventory_management` or any database not ending with `_test`.

---

## 8. Transaction Handling

- **Stock In / Stock Out (`stock-movements.repository.ts`):** Acquires `SELECT ... FOR UPDATE` on the target product, validates active status, exact `BigInt` unit precision, sufficient stock (for `out`), and max stock limit (`99999999999.999`), then updates `products.current_stock` + `products.updated_at` and inserts `stock_movements` atomically.
- **Product & Category Consistency (`products.repository.ts`, `categories.repository.ts`):** Product creation locks the selected category with `FOR SHARE`; product updates lock the product `FOR UPDATE`, lock a changed target category `FOR SHARE`, and verify `current_stock = 0` plus zero `stock_movements` rows before allowing a `unit` change.
- **Admin Membership Serialization (`users.repository.ts`):** Acquires `pg_advisory_xact_lock(20261112, 1)` prior to row locks when creating an `admin`, updating `role`, or updating `isActive`, then locks active admins in deterministic `ORDER BY users.id ASC FOR UPDATE` order to eliminate AB-BA deadlocks and protect the last active admin.
- **Timestamp behavior:** Updates write `updatedAt: sql\`NOW()\`` inside transactions (`transaction_timestamp()` in PostgreSQL). Under heavy lock contention, a blocked transaction that commits later records its `BEGIN` timestamp rather than post-lock `clock_timestamp()`.

---

## 9. Environment Variables

Defined and validated in [`src/config/env.ts`](./src/config/env.ts) (see [`.env.example`](./.env.example)):

| Variable | Default / Requirement | Description |
|---|---|---|
| `NODE_ENV` | `development` (`development` \| `test` \| `production`) | Runtime mode |
| `PORT` | `3001` | HTTP listen port |
| `DATABASE_URL` | Required (`postgres://` or `postgresql://`) | Primary PostgreSQL connection string |
| `DATABASE_URL_TEST` | Required for integration tests (`*_test`) | Isolated PostgreSQL test database URL |
| `BUSINESS_TIMEZONE` | `Asia/Jakarta` | Valid IANA timezone for dashboard month boundaries |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` (if unset; `*` rejected) | Comma-separated CORS/CSRF origin allowlist |
| `SESSION_COOKIE_NAME` | `ims_session` | HttpOnly session cookie name |
| `SESSION_TTL_DAYS` | `7` | Positive integer session TTL in days |
| `COOKIE_SECURE` | `true` in `production`, else `false` | Cookie `Secure` attribute |
| `COOKIE_SAME_SITE` | `lax` (`lax` \| `strict` \| `none`) | Cookie `SameSite` attribute (`none` requires `COOKIE_SECURE=true`) |
| `TRUSTED_PROXY_IPS` | empty | Comma-separated proxy IPs or CIDRs |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Max failed/attempted logins per window per bucket |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `900` | Rate-limit window in seconds |
| `ENABLE_SWAGGER` | `true` in `development`, else `false` | Enables `/docs` and `/docs/json` |
| `SEED_ADMIN_NAME` / `EMAIL` / `PASSWORD` | Required only for `bun run db:seed` | Initial development Admin seed user |

---

## 10. Running Backend

From `apps/backend` (or using root workspace scripts):

```bash
# Development watch mode (http://localhost:3001)
bun run dev

# Type check
bun run typecheck

# Bundle for Bun target into dist/
bun run build

# Run bundled artifact
bun run start
```

---

## 11. Database Migration

```bash
# Generate SQL migration from Drizzle schema changes
bun run db:generate

# Apply migrations to DATABASE_URL
bun run db:migrate

# Apply migrations to isolated DATABASE_URL_TEST
bun run db:migrate:test

# Verify schema/migration consistency
bun run db:check

# Seed initial Admin & 3 default categories (blocked when NODE_ENV=production)
bun run db:seed
```

---

## 12. Running Backend Tests

[`bunfig.toml`](./bunfig.toml) preloads [`tests/setup.ts`](./tests/setup.ts) with a 30-second test timeout (`timeout = 30000`). When `DATABASE_URL_TEST` is unset, `setup.ts` substitutes a blocked sentinel URL so integration suites never fall back to `.env` `DATABASE_URL`.

```bash
bun run test
```

The test suite (`15` files under [`tests/`](./tests)) covers:
- Unit & security validation (`env.test.ts`, `decimal-and-pagination.test.ts`, `timezone.test.ts`, `remediation-unit.test.ts`)
- Live PostgreSQL schema constraints & transactions (`database-schema.test.ts`, `health.test.ts`, `core-plugins.test.ts`)
- API integration flows (`auth.test.ts`, `users.test.ts`, `categories.test.ts`, `products.test.ts`, `stock-movements.test.ts`, `dashboard.test.ts`)
- Cross-module concurrency & timestamp consistency (`cross-module-concurrency.test.ts`, `timestamp-and-session-consistency.test.ts`)

---

## 13. API Documentation

- Interactive Swagger/OpenAPI UI: `GET http://localhost:3001/docs` (when `ENABLE_SWAGGER=true`)
- OpenAPI schema JSON: `GET http://localhost:3001/docs/json`
- Full endpoint contract: [`../../docs/api-contract.md`](../../docs/api-contract.md)

---

## 14. Bruno Integration Testing

The repository includes a 54-request Bruno collection at [`../../bruno/`](../../bruno/README.md). When running Bruno against a local backend for verification:

1. Start the backend with `DATABASE_URL` overridden to your isolated test database (`inventory_management_test`) rather than the application database.
2. Ensure an active Admin (`admin@example.com`) and Staff (`staff@example.com`) exist in that test database and supply `vars:secret` values at runtime (via Bruno Desktop or `--env-var` CLI flags).
3. Run folders sequentially: `01-health` → `02-auth-and-negative` → `03-admin-flow` → `04-staff-flow`.
