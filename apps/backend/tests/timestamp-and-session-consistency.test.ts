import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { createApp } from "../src/app";
import { NotFoundError } from "../src/common/errors";
import { hashSessionToken } from "../src/common/security";
import type { BackendEnv } from "../src/config/env";
import { db } from "../src/db";
import {
  categories,
  products,
  sessions,
  stockMovements,
  users,
  type UserRole,
} from "../src/db/schema";
import type { AuthRepository } from "../src/modules/auth/auth.repository";
import { createAuthService } from "../src/modules/auth/auth.service";
import { createUsersService } from "../src/modules/users/users.service";
import type { UsersRepository } from "../src/modules/users/users.repository";

const MS_PER_DAY = 86_400_000;

function createTestEnv(overrides: Partial<BackendEnv> = {}): BackendEnv {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    DATABASE_URL:
      process.env.DATABASE_URL_TEST ??
      "postgresql://blocked:blocked@127.0.0.1:1/database_url_test_not_configured",
    BUSINESS_TIMEZONE: "Asia/Jakarta",
    CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
    SESSION_COOKIE_NAME: "ims_session",
    SESSION_TTL_DAYS: 7,
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: "lax",
    TRUSTED_PROXY_IPS: [],
    LOGIN_RATE_LIMIT_MAX: 200,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
    ...overrides,
  };
}

function extractCookiePair(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("Expected Set-Cookie header");
  }
  const match = /ims_session=([^;]+)/.exec(setCookieHeader);
  if (!match?.[1]) {
    throw new Error(`Expected ims_session cookie in: ${setCookieHeader}`);
  }
  return `ims_session=${match[1]}`;
}

function extractRawToken(setCookieHeader: string | null): string {
  return extractCookiePair(setCookieHeader).slice("ims_session=".length);
}

describe("F-06 & Password Reset unit behavior", () => {
  test("resetUserPassword hashes with Argon2id and delegates existence + lock to resetPasswordInTx without redundant findById", async () => {
    let findByIdCalls = 0;
    let receivedHash = "";
    let txCalls = 0;

    const usersRepoMock = {
      findById: async () => {
        findByIdCalls += 1;
        return null;
      },
      resetPasswordInTx: async (input: {
        id: string;
        passwordHash: string;
      }) => {
        txCalls += 1;
        receivedHash = input.passwordHash;
        if (input.id === "missing-user") {
          throw new NotFoundError("Pengguna tidak ditemukan");
        }
      },
    } as unknown as UsersRepository;

    const authRepoMock = {
      revokeAllSessionsForUser: async () => undefined,
    };

    const service = createUsersService({
      repository: usersRepoMock,
      authRepository: authRepoMock,
    });

    await service.resetUserPassword("user-1", "NewStrongPass#2026");
    expect(findByIdCalls).toBe(0);
    expect(txCalls).toBe(1);
    expect(receivedHash.startsWith("$argon2id$")).toBe(true);
    expect(
      await Bun.password.verify("NewStrongPass#2026", receivedHash),
    ).toBe(true);

    let thrown: unknown = null;
    try {
      await service.resetUserPassword("missing-user", "NewStrongPass#2026");
    } catch (error) {
      thrown = error;
    }
    expect(findByIdCalls).toBe(0);
    expect(txCalls).toBe(2);
    expect(thrown).toBeInstanceOf(NotFoundError);
  });

  test("authService.login delegates SESSION_TTL_DAYS to DB createSession without relying on app Date.now()", async () => {
    const dbComputedExpiresAt = new Date("2030-01-08T00:00:00.000Z");
    let capturedTtlDays: number | undefined;
    const passwordHash = await Bun.password.hash("CorrectPass#2026", {
      algorithm: "argon2id",
    });

    const authRepoMock = {
      findUserByEmail: async () => ({
        id: "u-1",
        name: "Unit User",
        email: "unit@example.com",
        passwordHash,
        role: "admin" as const,
        isActive: true,
      }),
      createSession: async (input: {
        userId: string;
        tokenHash: string;
        ttlDays: number;
      }) => {
        capturedTtlDays = input.ttlDays;
        return { id: "s-1", expiresAt: dbComputedExpiresAt };
      },
      findActiveSessionByTokenHash: async () => null,
      revokeSessionById: async () => undefined,
      revokeAllSessionsForUser: async () => undefined,
    } satisfies AuthRepository;

    const authService = createAuthService({
      repository: authRepoMock,
      rateLimiter: {
        consume: () => ({ allowed: true, retryAfterSeconds: 0 }),
        reset: () => undefined,
        size: () => 0,
      },
      env: { SESSION_TTL_DAYS: 7 },
    });

    const result = await authService.login({
      email: "unit@example.com",
      password: "CorrectPass#2026",
      clientIp: "127.0.0.1",
    });

    expect(capturedTtlDays).toBe(7);
    expect(result.expiresAt.getTime()).toBe(dbComputedExpiresAt.getTime());
  });
});

describe("Remediation 3.3 integration: PostgreSQL clock consistency, session expiry, and password reset", () => {
  const app = createApp({ env: createTestEnv() });
  const runId = crypto.randomUUID().slice(0, 8);
  const password = "InitialPassword#2026";

  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdMovementIds: string[] = [];

  let adminId = "";
  let adminCookie = "";
  let staffId = "";
  let inactiveUserId = "";
  let categoryId = "";
  let productId = "";

  const adminEmail = `rem33-admin-${runId}@example.com`;
  const staffEmail = `rem33-staff-${runId}@example.com`;
  const inactiveEmail = `rem33-inactive-${runId}@example.com`;

  async function seedUser(input: {
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  }): Promise<string> {
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });
    const rows = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: input.isActive,
      })
      .returning({ id: users.id });

    const created = rows[0]!;
    createdUserIds.push(created.id);
    return created.id;
  }

  async function loginAs(
    email: string,
    secret = password,
    customApp = app,
  ): Promise<{ cookiePair: string; rawToken: string }> {
    const res = await customApp.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: secret }),
      }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    return {
      cookiePair: extractCookiePair(setCookie),
      rawToken: extractRawToken(setCookie),
    };
  }

  beforeAll(async () => {
    adminId = await seedUser({
      name: "Rem33 Admin",
      email: adminEmail,
      role: "admin",
      isActive: true,
    });
    staffId = await seedUser({
      name: "Rem33 Staff",
      email: staffEmail,
      role: "staff",
      isActive: true,
    });
    inactiveUserId = await seedUser({
      name: "Rem33 Inactive",
      email: inactiveEmail,
      role: "staff",
      isActive: false,
    });

    adminCookie = (await loginAs(adminEmail)).cookiePair;

    const catRes = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ name: `Rem33 Cat ${runId}` }),
      }),
    );
    expect(catRes.status).toBe(201);
    const catBody = (await catRes.json()) as {
      data: { id: string; createdAt: string; updatedAt: string };
    };
    categoryId = catBody.data.id;
    createdCategoryIds.push(categoryId);
    expect(catBody.data.createdAt).toBe(catBody.data.updatedAt);

    const prodRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          categoryId,
          sku: `REM33-${runId.toUpperCase()}`,
          name: "Rem33 Product",
          unit: "pcs",
          purchasePrice: "1000.00",
          sellingPrice: "1500.00",
          minimumStock: "1",
        }),
      }),
    );
    expect(prodRes.status).toBe(201);
    const prodBody = (await prodRes.json()) as {
      data: { id: string; createdAt: string; updatedAt: string };
    };
    productId = prodBody.data.id;
    createdProductIds.push(productId);
    expect(prodBody.data.createdAt).toBe(prodBody.data.updatedAt);
  });

  afterAll(async () => {
    if (createdMovementIds.length > 0) {
      await db
        .delete(stockMovements)
        .where(inArray(stockMovements.id, createdMovementIds));
    }
    if (createdProductIds.length > 0) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdCategoryIds.length > 0) {
      await db
        .delete(categories)
        .where(inArray(categories.id, createdCategoryIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  test("DB clock timestamps advance on real updates, preserve no-op updates, and match within stock movement transactions", async () => {
    await Bun.sleep(15);

    // 1. Real category update + no-op status update
    const catUpdateRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ description: "Updated with DB NOW()" }),
      }),
    );
    expect(catUpdateRes.status).toBe(200);
    const catUpdated = ((await catUpdateRes.json()) as {
      data: { createdAt: string; updatedAt: string };
    }).data;
    expect(Date.parse(catUpdated.updatedAt)).toBeGreaterThan(
      Date.parse(catUpdated.createdAt),
    );

    const catNoopRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ isActive: true }),
      }),
    );
    expect(catNoopRes.status).toBe(200);
    const catNoop = ((await catNoopRes.json()) as {
      data: { updatedAt: string };
    }).data;
    expect(catNoop.updatedAt).toBe(catUpdated.updatedAt);

    // 2. Real product update + no-op status update
    await Bun.sleep(15);
    const prodUpdateRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ name: "Rem33 Product Updated" }),
      }),
    );
    expect(prodUpdateRes.status).toBe(200);
    const prodUpdated = ((await prodUpdateRes.json()) as {
      data: { createdAt: string; updatedAt: string };
    }).data;
    expect(Date.parse(prodUpdated.updatedAt)).toBeGreaterThan(
      Date.parse(prodUpdated.createdAt),
    );

    const prodNoopRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ status: "active" }),
      }),
    );
    expect(prodNoopRes.status).toBe(200);
    const prodNoop = ((await prodNoopRes.json()) as {
      data: { updatedAt: string };
    }).data;
    expect(prodNoop.updatedAt).toBe(prodUpdated.updatedAt);

    // 3. Stock In & Stock Out: product.updated_at and movement.created_at share exact transaction timestamp
    await Bun.sleep(15);
    for (const payload of [
      { productId, type: "in", quantity: "10", reason: "Stock In Consistency" },
      { productId, type: "out", quantity: "4", reason: "Stock Out Consistency" },
    ]) {
      const movRes = await app.handle(
        new Request("http://localhost/api/v1/stock-movements", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify(payload),
        }),
      );
      expect(movRes.status).toBe(201);
      const movBody = (await movRes.json()) as {
        data: { id: string; createdAt: string };
      };
      createdMovementIds.push(movBody.data.id);

      const [dbMovement] = await db
        .select({ createdAt: stockMovements.createdAt })
        .from(stockMovements)
        .where(eq(stockMovements.id, movBody.data.id));
      const [dbProduct] = await db
        .select({ updatedAt: products.updatedAt })
        .from(products)
        .where(eq(products.id, productId));

      expect(dbMovement).toBeDefined();
      expect(dbProduct).toBeDefined();
      expect(dbProduct!.updatedAt.getTime()).toBe(
        dbMovement!.createdAt.getTime(),
      );
    }
  });

  test("sessions use exact DB-computed absolute TTL without sliding expiration and enforce expiry & revocation", async () => {
    const login = await loginAs(staffEmail);
    const tokenHash = hashSessionToken(login.rawToken);

    const [createdRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
    expect(createdRow).toBeDefined();
    expect(createdRow!.revokedAt).toBeNull();
    // Exact 7-day DB interval: zero app/DB clock skew
    expect(createdRow!.expiresAt.getTime() - createdRow!.createdAt.getTime()).toBe(
      7 * MS_PER_DAY,
    );

    // Configurable TTL via DB interval (1 day)
    const shortApp = createApp({
      env: createTestEnv({ SESSION_TTL_DAYS: 1 }),
    });
    const shortLogin = await loginAs(staffEmail, password, shortApp);
    const [shortRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(shortLogin.rawToken)));
    expect(shortRow!.expiresAt.getTime() - shortRow!.createdAt.getTime()).toBe(
      1 * MS_PER_DAY,
    );

    // Repeated authenticated activity does not extend expires_at
    await Bun.sleep(15);
    const meRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: login.cookiePair },
      }),
    );
    expect(meRes.status).toBe(200);

    const [afterActivityRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, createdRow!.id));
    expect(afterActivityRow!.expiresAt.getTime()).toBe(
      createdRow!.expiresAt.getTime(),
    );

    // Expired session rejected using DB NOW()
    await db
      .update(sessions)
      .set({ expiresAt: sql`NOW() - INTERVAL '1 second'` })
      .where(eq(sessions.id, createdRow!.id));

    const expiredRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: login.cookiePair },
      }),
    );
    expect(expiredRes.status).toBe(401);

    // Logout revokes only the short session while leaving separate valid sessions intact
    const freshStaffLogin = await loginAs(staffEmail);
    const logoutRes = await app.handle(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie: shortLogin.cookiePair },
      }),
    );
    expect(logoutRes.status).toBe(200);

    const [revokedShortRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, shortRow!.id));
    expect(revokedShortRow!.revokedAt).not.toBeNull();

    const revokedShortMe = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: shortLogin.cookiePair },
      }),
    );
    expect(revokedShortMe.status).toBe(401);

    const otherSessionMe = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: freshStaffLogin.cookiePair },
      }),
    );
    expect(otherSessionMe.status).toBe(200);

    // Deactivation atomically updates users.updated_at and sessions.revoked_at using same transaction NOW()
    await Bun.sleep(15);
    const deactRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(deactRes.status).toBe(200);

    const [deactUserRow] = await db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, staffId));
    const [revokedByDeactRow] = await db
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(freshStaffLogin.rawToken)));

    expect(revokedByDeactRow!.revokedAt).not.toBeNull();
    expect(deactUserRow!.updatedAt.getTime()).toBe(
      revokedByDeactRow!.revokedAt!.getTime(),
    );

    // Reactivation never revives old session
    const reactRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ isActive: true }),
      }),
    );
    expect(reactRes.status).toBe(200);

    const oldAfterReact = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: freshStaffLogin.cookiePair },
      }),
    );
    expect(oldAfterReact.status).toBe(401);
  });

  test("password reset handles missing users (404), inactive users, atomic DB timestamps + session revocation, and concurrency", async () => {
    // 1. Not found user -> 404 NOT_FOUND
    const missingId = crypto.randomUUID();
    const missingRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${missingId}/password`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ newPassword: "MissingUserPass#2026" }),
      }),
    );
    expect(missingRes.status).toBe(404);
    const missingBody = (await missingRes.json()) as { error: { code: string } };
    expect(missingBody.error.code).toBe("RESOURCE_NOT_FOUND");

    // 2. Active user: old sessions invalidated, same TX timestamp on user.updated_at & session.revoked_at
    const staffLogin1 = await loginAs(staffEmail);
    const staffLogin2 = await loginAs(staffEmail);
    await Bun.sleep(15);

    const newStaffPass = "ResetStaffPass#2026";
    const resetRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}/password`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ newPassword: newStaffPass }),
      }),
    );
    expect(resetRes.status).toBe(200);

    const [updatedUser] = await db
      .select({
        passwordHash: users.passwordHash,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, staffId));
    expect(updatedUser!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(
      await Bun.password.verify(newStaffPass, updatedUser!.passwordHash),
    ).toBe(true);

    for (const raw of [staffLogin1.rawToken, staffLogin2.rawToken]) {
      const [sess] = await db
        .select({ revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.tokenHash, hashSessionToken(raw)));
      expect(sess!.revokedAt).not.toBeNull();
      expect(sess!.revokedAt!.getTime()).toBe(updatedUser!.updatedAt.getTime());
    }

    // Old sessions rejected
    const oldSessMe = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: staffLogin1.cookiePair },
      }),
    );
    expect(oldSessMe.status).toBe(401);

    // Old password rejected, new password accepted
    const oldPassLoginRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: staffEmail, password }),
      }),
    );
    expect(oldPassLoginRes.status).toBe(401);
    const freshStaffAfterReset = await loginAs(staffEmail, newStaffPass);
    expect(freshStaffAfterReset.cookiePair).toContain("ims_session=");

    // 3. Inactive user password reset remains supported (no auth rule change)
    const inactiveNewPass = "InactiveReset#2026";
    const inactiveResetRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${inactiveUserId}/password`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ newPassword: inactiveNewPass }),
      }),
    );
    expect(inactiveResetRes.status).toBe(200);
    const [inactiveRow] = await db
      .select({
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, inactiveUserId));
    expect(inactiveRow!.isActive).toBe(false);
    expect(
      await Bun.password.verify(inactiveNewPass, inactiveRow!.passwordHash),
    ).toBe(true);

    // 4. Concurrent password reset + profile update serialize cleanly without losing updates or leaving live sessions
    const [concResetRes, concUpdateRes] = await Promise.all([
      app.handle(
        new Request(`http://localhost/api/v1/users/${staffId}/password`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({ newPassword: "ConcurrentPass#2026" }),
        }),
      ),
      app.handle(
        new Request(`http://localhost/api/v1/users/${staffId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({ name: "Rem33 Staff Concurrent" }),
        }),
      ),
    ]);
    expect(concResetRes.status).toBe(200);
    expect(concUpdateRes.status).toBe(200);

    const postConcMe = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: freshStaffAfterReset.cookiePair },
      }),
    );
    expect(postConcMe.status).toBe(401);

    const [finalStaff] = await db
      .select({ name: users.name, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, staffId));
    expect(finalStaff!.name).toBe("Rem33 Staff Concurrent");
    expect(
      await Bun.password.verify("ConcurrentPass#2026", finalStaff!.passwordHash),
    ).toBe(true);
  });
});
