# IMS Frontend (`apps/frontend`)

Web application for the Inventory Management System (IMS), built with **Next.js App Router**, **React**, **TypeScript**, and **Tailwind CSS**.

---

## 1. Frontend Overview

The frontend provides authenticated operational screens for warehouse dashboard monitoring, product catalog and category management, atomic Stock In / Stock Out entry, immutable stock movement history, and Admin user administration. It communicates exclusively with the backend `/api/v1` REST API using `HttpOnly` cookie sessions.

---

## 2. Technology Stack

| Package | Version | Role |
|---|---|---|
| `next` | `16.4.6` | App Router framework and build tooling |
| `react` / `react-dom` | `19.3.0` | UI runtime |
| `tailwindcss` + `@tailwindcss/turbopack` | `4.3.3` | Utility-first styling |
| `typescript` | `^5` | Static type checking |
| `eslint` + `eslint-config-next` | `^9` / `16.4.6` | Code quality and Next.js lint rules |

---

## 3. Application Structure

Source code under [`src/`](./src):

- `src/app/`:
  - `page.tsx` & `login/page.tsx` — entry route and login screen
  - `(protected)/layout.tsx` — wraps protected pages in `RequireAuth` + `AppShell`
  - `(protected)/dashboard/page.tsx` — inventory summary & recent activity
  - `(protected)/products/page.tsx` — product catalog, filters, detail modal, Admin CRUD
  - `(protected)/categories/page.tsx` — category listing & Admin CRUD
  - `(protected)/stock-movements/page.tsx` — Stock In / Stock Out form, deep-linked filters, history table
  - `(protected)/users/page.tsx` — Admin-only user management (`allowedRoles={["admin"]}`)
- `src/components/`:
  - `auth/` — `AuthProvider`, `RequireAuth`
  - `layout/` — `AppShell`, `PageHeader`
  - `ui/` — `FeedbackBanner`, `StatusBadge`, `ModalDialog`, `PaginationControls`, `SearchableSelect`
- `src/features/` — view components and row/modal subcomponents (`categories/`, `dashboard/`, `products/`, `stock-movements/`, `users/`)
- `src/hooks/use-auth.ts` — typed auth context consumer
- `src/lib/` — `api-client.ts`, `env.ts`, `errors.ts`, `format.ts` (IDR, quantities, `Asia/Jakarta` WIB date formatting), `navigation.ts` (`sanitizeNextPath`), `reference-helpers.ts`
- `src/services/` — API clients (`auth`, `users`, `categories`, `products`, `stock-movements`, `dashboard`)
- `src/types/` — `api.ts` (`API_ERROR_CODES`, pagination & envelope types), `auth.ts`, `inventory.ts` (`isAdminProductDto`)

---

## 4. Authentication Flow

- [`AuthProvider`](./src/components/auth/auth-provider.tsx) hydrates session state on mount via `GET /api/v1/auth/me` (`credentials: "include"`).
- [`RequireAuth`](./src/components/auth/auth-guard.tsx) blocks unauthenticated access and redirects to `/login?next=<encoded-path>` (validated by [`sanitizeNextPath`](./src/lib/navigation.ts) to prevent open redirects).
- A global unauthorized callback registered via `setUnauthorizedHandler` clears client auth state whenever any authenticated API call returns `401 Unauthorized`.

---

## 5. Role-Based UI

- [`AppShell`](./src/components/layout/app-shell.tsx) filters `NAV_ITEMS` by `user.role`, hiding the `/users` navigation link from `staff`.
- `/users` wraps its page in `<RequireAuth allowedRoles={["admin"]}>`, rendering an explicit `403` access-denied panel to `staff`.
- Product and category views adjust status filters, action buttons, and detail rendering ([`ProductDetailModalContent`](./src/features/products/product-detail-modal-content.tsx)) using `isAdminProductDto` so `purchasePrice` and `sellingPrice` render only for `admin`.
- Frontend role checks are purely for user experience; RBAC and price stripping are strictly enforced by the backend API.

---

## 6. API Integration

[`apiRequest`](./src/lib/api-client.ts) standardizes all backend calls:

- Sends `credentials: "include"` so the browser attaches the `HttpOnly` session cookie (`ims_session`) on cross-origin (`localhost:3000` → `localhost:3001`) requests.
- Attaches a generated `X-Request-ID` header (`fe-<uuid>`) for request correlation.
- Supports `AbortSignal` cleanup on component unmount/filter changes.
- Parses backend error envelopes, HTTP status, `details`, `requestId`, and `Retry-After` headers into [`ApiClientError`](./src/lib/api-client.ts).
- [`API_ERROR_CODES`](./src/types/api.ts) stays aligned 1-to-1 with backend `ERROR_CODES` (verified in backend unit tests).

---

## 7. Shared Components

- [`SearchableSelect`](./src/components/ui/searchable-select.tsx): async searchable combobox using `REFERENCE_PAGE_SIZE = 20` with server-side search, incremental *Load More* pagination, retry handling, and local fallback options (for example, Staff filtering movement history by observed deactivated products without querying `/products?status=inactive`).
- [`ModalDialog`](./src/components/ui/modal.tsx), [`PaginationControls`](./src/components/ui/pagination.tsx), [`FeedbackBanner`](./src/components/ui/alert.tsx), [`StatusBadge`](./src/components/ui/badge.tsx), [`AppShell`](./src/components/layout/app-shell.tsx), and [`PageHeader`](./src/components/layout/page-header.tsx).

---

## 8. Environment Variables

Defined in [`src/lib/env.ts`](./src/lib/env.ts) (see [`.env.example`](./.env.example)):

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001/api/v1` | Backend REST API base URL (`http://` or `https://`, trailing slash stripped) |

Create `apps/frontend/.env.local` from `.env.example` when configuring a non-default backend URL.

---

## 9. Running Frontend

From `apps/frontend` (or via root workspace scripts):

```bash
# Development server (http://localhost:3000)
bun run dev

# Start production Next.js server after build
bun run start

# Run frontend tests (bun test)
bun run test
```

> **Testing Scope Note:** [`tests/frontend-quality.test.ts`](./tests/frontend-quality.test.ts) runs under `bun test` and verifies reference pagination/deep-link helpers, role-scoped `productsService` DTO handling, `apiRequest` error/401/abort propagation, and SSR component output via `renderToStaticMarkup`. Interactive browser DOM event tests (Playwright / React Testing Library) are not included in the current repository.

---

## 10. Type Checking

Generates Next.js route types and runs TypeScript compiler checks (`next typegen && tsc --noEmit`):

```bash
bun run typecheck
```

---

## 11. Linting

Runs ESLint using [`eslint.config.mjs`](./eslint.config.mjs) (`eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`):

```bash
bun run lint
```

---

## 12. Build

Builds the production Next.js bundle (`next build` with Turbopack):

```bash
bun run build
```
