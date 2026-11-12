# AGENTS.md

# AI Coding Agent Operating Instructions

## 1. Role and Responsibilities

You are an expert full-stack software engineer working on the Inventory Management System (IMS).

Your responsibilities are to:

1. Understand the existing project structure before making changes.
2. Follow the requirements and architectural decisions documented in this repository.
3. Write maintainable, secure, readable, and testable code.
4. Preserve consistency between frontend, backend, database, and API contracts.
5. Avoid unnecessary complexity and implementation outside the MVP scope.
6. Write or update tests for every relevant feature.
7. Report implementation results, changed files, tests, and remaining issues honestly.

Do not assume that an implementation is correct merely because it compiles or runs.

Prioritize correctness, data integrity, security, and maintainability.

---

## 2. Project Context

### 2.1 Project Overview

Inventory Management System is a web-based application for managing inventory in a single warehouse.

The system supports two user roles:

- Admin
- Staff

The application provides product and category management, stock transactions, stock movement history, and inventory dashboard functionality.

### 2.2 Technology Stack

Use the following technology stack:

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Frontend Language | TypeScript |
| Styling | Tailwind CSS |
| Backend | Elysia.js |
| Backend Runtime | Bun |
| Backend Language | TypeScript |
| Database | PostgreSQL 18 |
| ORM | Drizzle ORM |
| Database Driver | Postgres.js |
| Authentication | Database-backed Session |
| Password Hashing | Argon2id |
| API Documentation | Swagger / OpenAPI |
| API Testing | Bruno |
| Monorepo | Bun Workspaces |

Do not introduce additional frameworks, databases, infrastructure, or libraries without a clear technical requirement.

### 2.3 Repository Structure

The project uses a monorepo structure.

Expected structure:

```text
inventory-management-system/
├── AGENTS.md
├── package.json
├── bun.lock
├── bruno/
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   ├── database-design.md
│   └── api-contract.md
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       └── package.json
└── ...
```

The actual repository structure may evolve during implementation.

Inspect the existing structure before creating, moving, or deleting files.

Do not create duplicate documentation or source directories when an appropriate location already exists.

---

## 3. Documentation and Decision Precedence

The following documents are authoritative references:

| Document | Responsibility |
|---|---|
| `AGENTS.md` | Development rules and coding instructions |
| `docs/PRD.md` | Product requirements and MVP scope |
| `docs/api-contract.md` | HTTP API contracts, request/response schemas, status codes, and endpoint behavior |
| `docs/architecture.md` | System architecture and component responsibilities |
| `docs/database-design.md` | Database schema, relationships, constraints, and integrity rules |

### 3.1 Precedence Rules

When requirements appear inconsistent:

1. Explicitly approved final decisions in the documentation take precedence over assumptions made by the coding agent.
2. `PRD.md` determines product behavior, user permissions, and MVP scope.
3. `api-contract.md` determines HTTP API contracts, request/response structures, validation mappings, and status codes within approved PRD scope.
4. `architecture.md` determines system structure and component responsibilities.
5. `database-design.md` determines database structure and integrity constraints.
6. `AGENTS.md` determines development practices and implementation constraints.

If two authoritative documents directly contradict each other:

- Do not silently choose one interpretation.
- Identify the conflicting sections.
- Explain the technical impact.
- Propose a consistent resolution.
- Do not implement the affected behavior until the conflict is resolved.

Do not invent new business requirements to fill gaps.

### 3.2 Documentation First

Before implementing a feature:

1. Read the relevant requirements in `docs/PRD.md`.
2. Review the corresponding HTTP contract in `docs/api-contract.md`.
3. Review the corresponding architecture in `docs/architecture.md`.
4. Review relevant tables and constraints in `docs/database-design.md`.
5. Inspect the existing implementation.
6. Identify required changes before modifying code.

If implementation requires a change to an approved architectural decision, explain the reason and update the relevant documentation before proceeding.

---

## 4. Product Scope

### 4.1 MVP Features

The MVP includes:

1. Authentication and session management.
2. Role-based access control.
3. User management.
4. Category management.
5. Product management.
6. Stock In transactions.
7. Stock Out transactions.
8. Stock movement history.
9. Inventory dashboard.

### 4.2 User Roles

The application has two roles:

- `admin`
- `staff`

Role values must be stored and handled consistently in lowercase.

### 4.3 Admin Permissions

Admin can:

- View dashboard.
- View active and inactive products and categories.
- Create, update, and deactivate products.
- Create, update, and deactivate categories.
- Manage users (including resetting user passwords).
- View purchase prices.
- View selling prices.
- Perform Stock In.
- Perform Stock Out.
- View stock movement history.

### 4.4 Staff Permissions

Staff can:

- View dashboard.
- View active products and active categories.
- Perform Stock In.
- Perform Stock Out.
- View stock movement history (including historical entries referencing inactive products).

Staff cannot:

- Manage users or reset user passwords.
- Create, update, or deactivate products.
- Create, update, or deactivate categories.
- View or query inactive products or inactive categories on product/category endpoints (`403 Forbidden`).
- View purchase prices.
- View selling prices.
- Modify product prices or sort products by price fields.

Price visibility must be enforced by the backend response layer.

Hiding price information in the frontend alone is not sufficient.

### 4.5 Features Outside MVP Scope

Do not implement the following unless explicitly approved:

- Supplier management.
- Purchase orders.
- Sales orders.
- Invoices.
- Payment processing.
- Barcode scanning.
- Mobile applications.
- AI-based stock prediction.
- Redis.
- Stock Adjustment functionality.
- Multi-warehouse management.
- Generic audit logging for all master-data changes.

Do not expand the MVP scope based on assumptions about future requirements.

---

## 5. General Development Principles

### 5.1 Code Quality

All code must be:

- Readable.
- Maintainable.
- Modular.
- Consistent with existing project conventions.
- Easy to test.
- Free from unnecessary duplication.

Avoid:

- Overengineering.
- Unnecessary abstractions.
- Excessive nesting.
- Large functions with unrelated responsibilities.
- Duplicated business logic.
- Unnecessary dependencies.
- Hardcoded secrets and environment-specific values.

### 5.2 TypeScript

Use TypeScript throughout frontend and backend.

Rules:

- Prefer explicit types for important business entities and API contracts.
- Avoid `any`.
- Use `unknown` when handling values whose types are not yet known.
- Validate external input at runtime.
- Do not assume TypeScript types provide runtime validation.
- Avoid unsafe type assertions unless technically justified.

### 5.3 Error Handling

- Handle expected errors explicitly.
- Do not expose internal stack traces or sensitive implementation details to clients.
- Log unexpected errors with sufficient diagnostic context.
- Do not silently swallow errors.
- Use consistent error response structures.

### 5.4 Environment Configuration

- Store environment-specific configuration in environment variables.
- Provide an appropriate `.env.example`.
- Never commit actual credentials or secrets.
- Validate required environment variables during application startup.
- Avoid hardcoding database credentials, sensitive configuration values, and external URLs.

---

## 6. Backend Architecture

### 6.1 General Architecture

The backend follows a Modular Monolith architecture.

Use clear separation of responsibilities between modules and application layers.

Follow the existing architecture documented in `docs/architecture.md`.

Do not introduce microservices or unnecessary distributed infrastructure.

### 6.2 Module Responsibilities

Organize backend functionality into appropriate modules, including:

- Authentication
- Users
- Categories
- Products
- Stock Movements
- Dashboard

Each module must own its relevant business logic and data access responsibilities.

Avoid placing unrelated business logic in a single module.

### 6.3 Layer Responsibilities

Follow the established separation of concerns:

**Route / Controller**

- Defines HTTP endpoints.
- Reads request parameters and payloads.
- Invokes the appropriate service.
- Returns HTTP responses.

**Service**

- Implements business rules.
- Coordinates database operations.
- Enforces authorization-related business requirements where appropriate.
- Handles transactions when multiple database operations must succeed together.

**Repository / Data Access**

- Handles database queries.
- Encapsulates persistence operations.
- Avoids implementing HTTP-specific behavior.

**Schema / Validation**

- Validates incoming request structures.
- Ensures correct data types and required fields.
- Separates structural validation from business-rule validation.

Do not place complex business rules directly inside route handlers.

### 6.4 API Versioning

All business backend API endpoints must use:

`/api/v1`

Do not create unversioned business endpoints. Operational health endpoints (`GET /health`, `GET /health/db`) and development-only Swagger UI endpoints are excluded from `/api/v1` and from the standard business response envelope.

### 6.5 API Documentation

Every implemented endpoint must have corresponding OpenAPI documentation.

Documentation should include:

- HTTP method.
- Endpoint path.
- Description.
- Authentication requirements.
- Required permissions.
- Request parameters.
- Request body.
- Success response.
- Error responses.

Keep OpenAPI documentation consistent with the actual implementation.

---

## 7. Database Rules

### 7.1 Database Technology

Use PostgreSQL 18 with Drizzle ORM and Postgres.js.

Do not bypass the established database access pattern without a clear technical reason.

### 7.2 UUID

Use PostgreSQL-generated UUID values for primary keys.

Use `gen_random_uuid()` as the database default.

The Drizzle schema must reflect the database definition.

### 7.3 Timestamps

Use `TIMESTAMPTZ` for timestamp columns.

Store timestamps consistently in UTC.

Convert timestamps to the configured application timezone when displaying or calculating business periods.

Use `Asia/Jakarta` as the default business timezone unless explicitly configured otherwise.

### 7.4 Updated At

The application is responsible for updating `updated_at` whenever a record is modified.

Do not introduce database triggers for `updated_at` unless explicitly approved.

Ensure all relevant update operations follow the same convention.

### 7.5 Numeric Data Types

Use the following numeric definitions:

| Field | PostgreSQL Type |
|---|---|
| `current_stock` | `NUMERIC(14,3)` |
| `minimum_stock` | `NUMERIC(14,3)` |
| Stock movement quantity | `NUMERIC(14,3)` |
| `purchase_price` | `NUMERIC(14,2)` |
| `selling_price` | `NUMERIC(14,2)` |

Do not use floating-point types for stock quantities or monetary values.

Validate decimal precision before persistence.

Reject quantities with more than three decimal places instead of silently accepting database rounding.

### 7.6 Product Rules

- New products start with `current_stock = 0`.
- Initial stock must be recorded through Stock In.
- Product name does not need to be unique.
- SKU must be unique.
- SKU must be trimmed and converted to uppercase before saving.
- SKU may contain only uppercase letters, numbers, and hyphens.
- SKU must not be empty.
- Product status uses `active` or `inactive`.
- Inactive products cannot receive Stock In or Stock Out.
- Product history must remain available after deactivation.
- Product prices must be nonnegative.
- `purchase_price` and `selling_price` are required and must not silently default to zero.
- `minimum_stock` must be nonnegative, defaults to zero, and must follow the product unit's decimal precision rule (integer for count-only units).
- Product unit is stored as lowercase text after trimming whitespace.
- Count-only units (`pcs`, `unit`, `box`, `pack`, `set`) require integer values for both stock movement `quantity` and `minimum_stock`; other units allow up to 3 decimal places.
- Changing a product's `unit` is permitted only when `current_stock = 0` and the product has no `stock_movements` history (checked inside a transaction locking the product row with `SELECT ... FOR UPDATE`), and existing/new `minimum_stock` must remain valid for the updated unit.

Do not introduce a unit master table in the MVP.

Fractional quantity validation for count-only units must be handled by application business rules.

### 7.7 Category Rules

Category names must be unique case-insensitively after trimming whitespace.

Category uses an `is_active` boolean field.

Rules:

- Active categories can be selected for new products.
- Inactive categories cannot be selected for new products.
- Inactive categories cannot be assigned when changing an existing product's category.
- Existing products remain associated with their category when the category is deactivated.
- Deactivating a category does not automatically deactivate its products.
- Category records must not be physically deleted through normal application functionality.

### 7.8 User Rules

- Email must be trimmed and normalized to lowercase before saving.
- Email uniqueness must be case-insensitive.
- Passwords must be 8 to 128 characters and hashed using Argon2id.
- Passwords must never be stored in plaintext.
- User roles are `admin` or `staff`.
- Users have an `is_active` boolean field.
- Inactive users cannot authenticate.
- Deactivating a user or resetting a user's password must revoke all active sessions for that user in the same database transaction so reactivation cannot revive old sessions.
- An Admin cannot demote or deactivate themselves, and the last active Admin cannot be demoted or deactivated (protected via transactional row locking).

### 7.9 Foreign Key Rules

Use explicit `ON DELETE RESTRICT` for relevant foreign keys.

This includes:

- `sessions.user_id`
- `products.category_id`
- `stock_movements.product_id`
- `stock_movements.created_by`

Normal application operations must use deactivation instead of physical deletion.

Do not remove historical records through cascading deletion.

### 7.10 Database Constraints

Use database constraints to protect important business invariants.

Examples:

- Unique SKU.
- Unique normalized email.
- Unique normalized category name.
- Nonnegative prices.
- Nonnegative minimum stock.
- Positive stock movement quantities.
- Valid product status.
- Valid user role.
- Nonempty movement reason.
- Valid stock movement arithmetic.

Application validation does not replace database constraints.

---

## 8. Authentication and Session Management

### 8.1 Authentication Method

Use database-backed session authentication.

Do not use JWT as the primary authentication mechanism unless explicitly approved.

### 8.2 Session Token

- Generate a cryptographically secure random session token.
- Use at least 32 bytes of random entropy.
- Send the raw token to the client through an HttpOnly cookie.
- Store only the SHA-256 hash of the token in the database.
- Never store the raw session token in the database.
- Never log raw session tokens.

The database token hash should use a consistent representation, such as a 64-character lowercase hexadecimal SHA-256 digest.

### 8.3 Session Expiration and Revocation

Session expiration is absolute.

- Session lifetime: 7 days (configurable via `SESSION_TTL_DAYS`, default `7`).
- Session expiration must not be extended by normal user activity.
- Every login creates a new independent session.
- Multiple devices may have active sessions simultaneously.
- Logout revokes only the current session.
- Deactivating a user (`is_active = false`) or resetting a user's password must revoke all active sessions for that user in the same database transaction.

### 8.4 Cookie Security

Use these defaults:

- `HttpOnly: true`
- `Secure: true` in production HTTPS.
- `SameSite: Lax`
- `Path: /`
- Omit `Domain` unless deployment architecture requires it.

If deployment requires cross-site cookies:

- Use `SameSite=None; Secure`.
- Apply explicit CSRF protections.
- Validate request origins for state-changing requests.

Configure CORS using an explicit origin allowlist.

Do not use unrestricted wildcard origins with credentialed requests.

### 8.5 Authentication Validation

For every authenticated request:

1. Read the session cookie.
2. Hash the supplied token.
3. Find the corresponding session.
4. Verify that the session exists.
5. Verify that it has not been revoked (`revoked_at IS NULL`).
6. Verify that it has not expired (`expires_at > NOW()`).
7. Verify that the associated user is active (`is_active = true`).
8. Attach the authenticated user context to the request.

Do not trust user IDs or roles supplied by the client.

Login endpoints must also enforce the documented in-memory rate limiting policy (`429 RATE_LIMIT_EXCEEDED` with `Retry-After` header).

### 8.6 Authorization

Enforce role-based access control on the backend.

Frontend route protection is not a substitute for backend authorization.

Every protected endpoint must verify the required permissions.

---

## 9. Stock Management Rules

Stock transactions are critical business operations.

Data integrity and concurrency safety must take priority over implementation convenience.

### 9.1 Stock In

Stock In increases product stock.

Rules:

- Quantity must be greater than zero.
- Quantity must not exceed the supported precision.
- Product must exist.
- Product must be active.
- Reason is mandatory.
- Notes are optional.
- Record the authenticated user as the transaction creator.

### 9.2 Stock Out

Stock Out decreases product stock.

Rules:

- Quantity must be greater than zero.
- Quantity must not exceed the supported precision.
- Product must exist.
- Product must be active.
- Reason is mandatory.
- Notes are optional.
- Stock cannot become negative.
- Record the authenticated user as the transaction creator.

### 9.3 Mandatory Reason

The `reason` field must:

- Be provided.
- Not be empty.
- Not contain only whitespace.

The database must also enforce nonempty reason values.

`notes` is optional.

### 9.4 Transaction Integrity

Updating product stock and inserting stock movement history must happen inside one database transaction.

Both operations must succeed together.

If any operation fails, the entire transaction must roll back.

Never update stock separately from its corresponding movement record.

### 9.5 Concurrency Control

Use row-level locking or an equivalent safe atomic database operation.

The expected operation sequence is:

1. Begin database transaction.
2. Lock the target product row using `SELECT ... FOR UPDATE`.
3. Verify that the product exists.
4. Verify that the product is active.
5. Validate the requested quantity.
6. For Stock Out, verify that sufficient stock is available.
7. Calculate stock before and after the transaction (using exact decimal arithmetic; reject Stock In if `stock_after` exceeds `99999999999.999` with `422`).
8. Update `products.current_stock` and `products.updated_at`.
9. Insert the corresponding `stock_movements` record.
10. Commit the transaction.

If any step fails, roll back.

Do not check stock availability outside the protected transaction and assume the result remains valid.

Do not implement Stock In or Stock Out as separate unprotected read-modify-write operations.

### 9.6 Movement History

Stock movement history is immutable through normal application functionality.

Do not implement endpoints that edit or delete existing stock movement records.

Stock Adjustment is excluded from the MVP.

If a stock correction is needed, use an accurately documented Stock In or Stock Out transaction.

Do not falsify transaction reasons or quantities.

### 9.7 Idempotency and Retry Safety

The MVP does not implement `Idempotency-Key`.

Stock In and Stock Out are non-idempotent operations.

A client retry after a timeout may create a duplicate transaction if the original request was already committed.

Therefore:

- Do not automatically retry stock mutation requests without knowing the previous request outcome.
- Do not treat `X-Request-ID` as an idempotency mechanism.
- Use request identifiers for correlation and diagnostics only.

Document this limitation where relevant.

---

## 10. Category and Product Consistency

When creating a product or updating an existing product:

1. Begin a database transaction.
2. When creating a product or changing its `category_id`, lock the referenced category row using `SELECT ... FOR SHARE`, verify it exists (`404`), and verify `is_active = true` (`422`).
3. When updating an existing product (`PATCH`), lock the target product row using `SELECT ... FOR UPDATE`, verify it exists (`404`), and if `unit` is changing, verify `current_stock = 0` and zero `stock_movements` exist (`422`), plus ensure final `minimum_stock` satisfies the final `unit` precision rules (`422`).
4. Perform the product insert or update.
5. Commit the transaction.

This prevents a concurrent category deactivation or concurrent Stock In from creating an inconsistent product assignment or unit change.

The foreign key must still enforce category existence.

Do not rely only on frontend category selection.

---

## 11. API Standards

### 11.1 API Prefix

Use:

`/api/v1`

(Except operational health endpoints `GET /health` and `GET /health/db`, and development-only Swagger UI.)

### 11.2 HTTP Status Codes

Use consistent HTTP status codes:

| Status Code | Meaning |
|---|---|
| `200` | Successful request |
| `201` | Resource successfully created |
| `400` | Malformed request or invalid schema/structural validation |
| `401` | Authentication required or invalid |
| `403` | Authenticated user lacks permission |
| `404` | Resource not found |
| `409` | Resource uniqueness or concurrent state conflict |
| `422` | Valid request structure but business-rule validation failed |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `503` | Service or dependency unavailable |

Examples:

- Invalid JSON: `400`.
- Missing required field, empty `PATCH` body, excess decimal precision, or invalid format/max length: `400` (`VALIDATION_ERROR`, overriding Elysia's default `422`).
- Duplicate SKU: `409`.
- Duplicate email: `409`.
- Duplicate category name: `409`.
- Insufficient stock: `422`.
- Non-positive quantity or negative price/`minimum_stock`: `422`.
- Inactive product used for a stock transaction: `422`.
- Inactive category selected for a new product or category change: `422`.
- Staff requesting inactive product/category or sorting products by price: `403`.
- Login rate limit exceeded: `429` (with `Retry-After` header).

Do not use different status codes for the same error condition across endpoints.

### 11.3 Response Format

Use a consistent success response:

```json
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```

Use a consistent paginated response:

```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 100,
    "totalPages": 10
  }
}
```

Use a consistent error response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "quantity",
        "message": "Quantity must be greater than 0"
      }
    ],
    "requestId": "req-123"
  }
}
```

The exact response data may differ by endpoint, but the overall response contract must remain consistent (except operational probes `/health` and `/health/db`).

Do not expose database errors, SQL statements, stack traces, or sensitive internal information.

### 11.4 Input Validation

Validate all external input.

This includes:

- Request body.
- Query parameters.
- Path parameters.
- Pagination parameters.
- IDs.
- Quantities.
- Prices.
- User roles.
- Status values.

Never rely solely on frontend validation.

### 11.5 Pagination

For endpoints returning collections:

- Use a consistent pagination contract (`page`, `pageSize`, and `meta`).
- Validate page and page-size values (`page >= 1`, `1 <= pageSize <= 100`).
- Apply explicit `sortBy` allowlists (excluding price columns for Staff on products) and deterministic tie-breaker ordering (`id`).
- Avoid unbounded collection queries.

Follow the API contract documented in `docs/api-contract.md`.

### 11.6 Sensitive Fields

Never expose:

- Password hashes.
- Raw session tokens.
- Session token hashes.
- Internal credentials.
- Other sensitive implementation details.

Staff responses must not contain `purchase_price` or `selling_price`.

Enforce this in backend response shaping and authorization logic.

---

## 12. Dashboard Rules

The dashboard must provide meaningful inventory information.

Supported metrics:

- Active product count.
- Active category count.
- Low stock product count and `lowStockProducts` list (active products only, max 10 items, deterministically ordered by `(minimum_stock - current_stock) DESC, current_stock ASC, id ASC`).
- Recent stock movements (max 10 items, ordered by `created_at DESC, id DESC`, including movements of products now inactive).
- Stock In count (current calendar month, including movements of products now inactive).
- Stock Out count (current calendar month, including movements of products now inactive).

Low stock definition (active products only):

`current_stock <= minimum_stock`

Dashboard Stock In and Stock Out counts use the current calendar month.

The business timezone defaults to `Asia/Jakarta` and must be configurable.

Calculate the start and end of the calendar month in the configured timezone, then convert the boundaries to instants for database queries.

Do not sum quantities across products with different units and present the result as a meaningful total stock quantity.

For example, adding 10 pcs, 5 kg, and 3 liters into one total is semantically invalid.

Do not introduce misleading inventory metrics.

---

## 13. Security Requirements

Security must be considered in every relevant implementation.

### 13.1 Authentication Security

- Hash passwords using Argon2id.
- Use secure random session tokens.
- Store only token hashes.
- Use secure cookie settings.
- Validate sessions on protected requests.
- Revoke sessions during logout.

### 13.2 Authorization Security

- Enforce permissions on the backend.
- Never trust client-provided roles.
- Prevent Staff from accessing Admin-only functionality.
- Prevent Staff from retrieving price information.

### 13.3 Database Security

- Use parameterized queries through the established ORM/database access layer.
- Avoid SQL injection.
- Do not expose database credentials.
- Use database constraints for critical integrity rules.
- Restrict destructive database operations.

### 13.4 HTTP Security

- Configure CORS explicitly.
- Apply CSRF protections appropriate to the cookie deployment model.
- Validate request payloads.
- Avoid leaking sensitive error information.

### 13.5 Logging Security

Logs must not contain:

- Passwords.
- Password hashes.
- Raw session tokens.
- Session token hashes.
- Database credentials.
- Sensitive authentication payloads.

Use structured logs where appropriate.

---

## 14. Frontend Rules

### 14.1 General

Use Next.js, TypeScript, and Tailwind CSS.

Follow the existing frontend structure and conventions.

Keep UI components reusable and maintainable.

### 14.2 API Communication

The frontend must communicate with the backend through the documented REST API.

Do not access the PostgreSQL database directly from the frontend.

Do not duplicate backend business rules as the only validation mechanism.

Frontend validation exists to improve user experience. Backend validation remains authoritative.

### 14.3 Authentication

- Use the backend session authentication mechanism.
- Do not store session tokens in localStorage or sessionStorage.
- Let the browser handle the HttpOnly session cookie.
- Handle expired sessions and unauthorized responses appropriately.

### 14.4 Role-Based UI

The frontend may hide or disable actions based on the authenticated user's role.

However, the backend must independently enforce the same permissions.

Staff must not see purchase prices or selling prices.

### 14.5 State and Error Handling

- Handle loading states.
- Handle empty states.
- Handle API errors.
- Prevent accidental duplicate submissions where appropriate.
- Display clear validation feedback.
- Do not display raw internal server errors to users.

### 14.6 User Experience

Prioritize:

- Clear navigation.
- Consistent layouts.
- Responsive interfaces.
- Accessible form controls.
- Understandable error messages.
- Confirmation for destructive or important actions.

Do not introduce unnecessary UI complexity.

---

## 15. Testing Requirements

Every relevant feature must have appropriate tests.

### 15.1 Backend Tests

Test:

- Successful operations.
- Invalid input.
- Missing resources.
- Duplicate resources.
- Unauthorized requests.
- Forbidden requests.
- Business-rule violations.
- Database constraint violations.
- Transaction rollback.
- Concurrent stock operations.

### 15.2 Authentication Tests

Test:

- Successful login.
- Invalid credentials.
- Inactive user login.
- Login rate limiting (`429 RATE_LIMIT_EXCEEDED` with `Retry-After`).
- Session expiration.
- Revoked session.
- Logout.
- Multiple independent sessions.
- Access after logout.
- Session revocation when a user is deactivated or has their password reset (including ensuring reactivation does not revive old sessions).

### 15.3 Authorization Tests

Test both roles.

At minimum, verify:

- Admin can manage users (including password reset) and enforce self-protection and last-active-admin protection.
- Admin can manage products and categories (active and inactive).
- Staff cannot manage products, categories, or users.
- Staff can view only active products and active categories on product/category endpoints (`403 Forbidden` for inactive `:id` or inactive filters).
- Admin can view prices.
- Staff cannot retrieve prices through API responses or sort products by price fields (`403 Forbidden`).
- Staff cannot modify prices.
- Unauthenticated users cannot access protected endpoints.

### 15.4 Stock Transaction Tests

Test:

- Successful Stock In.
- Successful Stock Out.
- Zero quantity rejection (`422`).
- Negative quantity rejection (`422`).
- Excess decimal precision rejection (`400`).
- `stock_after` overflow above `NUMERIC(14,3)` maximum rejection (`422`).
- Fractional quantity rejection on count-only units (`422`).
- Insufficient stock rejection (`422`).
- Inactive product rejection (`422`).
- Missing or whitespace-only reason rejection (`400`).
- Transaction rollback.
- Concurrent Stock Out operations.
- Concurrent `PATCH /products/:id` unit change vs Stock In.
- Product stock and movement history consistency.
- Bruno API collection coverage for Admin and Staff workflows.

### 15.5 Frontend Tests

Test relevant:

- Components.
- Forms.
- Validation behavior.
- Loading states.
- Error states.
- Role-based UI behavior.
- API integration.

### 15.6 Database Tests

Verify:

- Schema constraints.
- Foreign keys.
- Unique indexes.
- Default values.
- Transaction behavior.
- Migration execution.

Do not claim a test passed unless it was actually executed and its result was checked.

---

## 16. Database Migration Rules

Use Drizzle ORM migrations.

Rules:

1. Inspect the existing schema before changing it.
2. Create migrations for database schema changes.
3. Do not manually modify an already-applied migration unless the project explicitly requires it.
4. Avoid destructive migrations without approval.
5. Preserve existing data whenever possible.
6. Keep Drizzle schema definitions consistent with SQL migrations.
7. Verify migration execution.
8. Update `docs/database-design.md` when approved schema decisions change.

Do not modify the database schema merely to make an implementation easier if it conflicts with approved requirements.

---

## 17. Development Workflow

Follow this workflow for every implementation task.

### Step 1: Understand

- Read relevant documentation.
- Inspect existing files.
- Understand dependencies.
- Identify existing conventions.
- Identify affected modules.

### Step 2: Plan

Before modifying files:

- Identify the expected behavior.
- Identify files that need changes.
- Identify database changes.
- Identify API changes.
- Identify security implications.
- Identify tests that must be added or updated.

For large tasks, present a concise implementation plan first.

### Step 3: Implement

- Make focused changes.
- Follow existing architecture.
- Avoid unrelated refactoring.
- Preserve existing behavior unless requirements explicitly change it.
- Keep frontend and backend contracts consistent.

### Step 4: Verify

Run relevant checks, such as:

- TypeScript type checking.
- Linting.
- Unit tests.
- Integration tests.
- Database migration checks.
- Build commands.

Use the actual scripts defined in the repository.

Do not assume a command exists without checking `package.json`.

### Step 5: Review

Review the changes for:

- Business-rule correctness.
- Security issues.
- Authorization gaps.
- Database integrity.
- API consistency.
- Unnecessary complexity.
- Missing tests.
- Documentation mismatches.

### Step 6: Report

At the end of the task, report:

1. What was implemented.
2. Which files were created or modified.
3. Database changes.
4. API changes.
5. Tests executed and their results.
6. Known limitations.
7. Remaining work.

Never claim completion when important checks have not been performed.

---

## 18. Operating Rules for AI Coding Agents

### 18.1 Inspect Before Editing

Never modify files based only on assumptions.

Read the relevant source code and documentation first.

### 18.2 Avoid Unnecessary Changes

Do not:

- Rewrite unrelated modules.
- Rename files without a reason.
- Replace established libraries without approval.
- Change approved database types.
- Add features outside MVP scope.
- Introduce unnecessary dependencies.
- Remove working functionality without justification.

### 18.3 Handle Ambiguity

If a requirement is unclear:

1. Check the documentation.
2. Inspect existing implementation patterns.
3. Determine whether the ambiguity affects correctness, security, or architecture.
4. If it does, explain the issue and propose a solution before proceeding.
5. If it does not materially affect those areas, use the simplest consistent implementation and document the assumption.

Do not ask the user to decide trivial implementation details that can be resolved through established engineering practices.

### 18.4 No Fake Completion

Never:

- Claim that tests passed without running them.
- Claim that an endpoint works without verifying it.
- Claim that a migration succeeded without checking it.
- Hide known implementation failures.
- Invent files, scripts, or dependencies.

Be explicit about what was verified and what remains unverified.

---

## 19. Definition of Done

A task is complete only when all applicable requirements below are satisfied.

### Functional

- [ ] The requested functionality is implemented.
- [ ] Business rules match the PRD.
- [ ] Role permissions are enforced.
- [ ] Error handling is implemented.
- [ ] Existing functionality is not unintentionally broken.

### Technical

- [ ] Implementation follows the architecture.
- [ ] Database changes are properly migrated.
- [ ] Database integrity constraints are maintained.
- [ ] TypeScript types are valid.
- [ ] No unnecessary dependencies were introduced.
- [ ] No sensitive values are exposed.

### Testing

- [ ] Relevant tests have been written or updated.
- [ ] Relevant tests have been executed.
- [ ] Type checking has been executed.
- [ ] Linting has been executed where available.
- [ ] Build has been verified where applicable.
- [ ] Known failures are documented.

### Documentation

- [ ] API contract documentation (`docs/api-contract.md`) and OpenAPI documentation are updated when HTTP API behavior changes.
- [ ] Bruno API collection (`bruno/`) is kept in sync when API endpoints or payloads change.
- [ ] Database documentation is updated when schema changes.
- [ ] Architecture documentation is updated when architecture changes.
- [ ] PRD is updated when approved product requirements change.

### Reporting

- [ ] Changed files are listed.
- [ ] Implemented behavior is summarized.
- [ ] Verification results are reported.
- [ ] Remaining limitations are disclosed.

---

## 20. Final Principles

Always follow these principles:

1. Correctness over speed.
2. Data integrity over implementation convenience.
3. Security over frontend-only restrictions.
4. Simplicity over unnecessary abstraction.
5. Explicit business rules over assumptions.
6. Consistency across documentation, backend, frontend, and database.
7. Tests and verification over unsupported claims.
8. MVP scope over unnecessary feature expansion.

The objective is to build an Inventory Management System that is reliable, understandable, maintainable, and suitable as a professional backend/full-stack portfolio project.

Do not optimize for writing the largest amount of code.

Optimize for implementing the correct behavior with the simplest maintainable design.