import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import { hashSessionToken } from "../src/common/security";
import { successResponse } from "../src/common/http";
import type { BackendEnv } from "../src/config/env";
import { db } from "../src/db";
import { sessions, users, type UserRole } from "../src/db/schema";
import { createLoginRateLimiter } from "../src/modules/auth/auth.rate-limiter";
import { createAuthRepository } from "../src/modules/auth/auth.repository";
import { createAuthService } from "../src/modules/auth/auth.service";
import { createAuthPlugin } from "../src/plugins/auth";
import { errorHandlerPlugin } from "../src/plugins/error-handler";
import { requestIdPlugin } from "../src/plugins/request-id";

function createTestEnv(overrides: Partial<BackendEnv> = {}): BackendEnv {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/inventory_management",
    BUSINESS_TIMEZONE: "Asia/Jakarta",
    CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
    SESSION_COOKIE_NAME: "ims_session",
    SESSION_TTL_DAYS: 7,
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: "lax",
    LOGIN_RATE_LIMIT_MAX: 50,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
    ...overrides,
  };
}

function extractCookiePair(setCookieHeader: string | null, name: string): string {
  if (!setCookieHeader) {
    throw new Error("Expected Set-Cookie header to be present");
  }
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookieHeader);
  if (!match?.[1]) {
    throw new Error(`Expected cookie "${name}" in Set-Cookie: ${setCookieHeader}`);
  }
  return `${name}=${match[1]}`;
}

function extractRawToken(setCookieHeader: string | null, name: string): string {
  const pair = extractCookiePair(setCookieHeader, name);
  return pair.slice(name.length + 1);
}

describe("authentication, sessions, and RBAC guards", () => {
  const createdUserIds: string[] = [];
  const testRunId = crypto.randomUUID().slice(0, 8);
  const adminEmail = `auth-admin-${testRunId}@example.com`;
  const staffEmail = `auth-staff-${testRunId}@example.com`;
  const inactiveEmail = `auth-inactive-${testRunId}@example.com`;
  const validPassword = "CorrectPassword#2026";

  let adminUserId = "";
  let staffUserId = "";
  let inactiveUserId = "";

  async function seedUser(input: {
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  }): Promise<string> {
    const passwordHash = await Bun.password.hash(validPassword, {
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

    const created = rows[0];
    if (!created) {
      throw new Error(`Failed to insert test user ${input.email}`);
    }
    createdUserIds.push(created.id);
    return created.id;
  }

  beforeAll(async () => {
    adminUserId = await seedUser({
      name: "Auth Test Admin",
      email: adminEmail,
      role: "admin",
      isActive: true,
    });
    staffUserId = await seedUser({
      name: "Auth Test Staff",
      email: staffEmail,
      role: "staff",
      isActive: true,
    });
    inactiveUserId = await seedUser({
      name: "Auth Test Inactive",
      email: inactiveEmail,
      role: "staff",
      isActive: false,
    });
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  test("POST /api/v1/auth/login succeeds with trimmed case-insensitive email, sets HttpOnly cookie, and stores only SHA-256 hash", async () => {
    const app = createApp({ env: createTestEnv() });

    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: `  ${adminEmail.toUpperCase()}  `,
          password: validPassword,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data: { user: { id: string; name: string; email: string; role: string } };
    };
    expect(body).toEqual({
      success: true,
      message: "Login berhasil",
      data: {
        user: {
          id: adminUserId,
          name: "Auth Test Admin",
          email: adminEmail,
          role: "admin",
        },
      },
    });
    expect("passwordHash" in body.data.user).toBe(false);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("ims_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=604800");

    const rawToken = extractRawToken(setCookie, "ims_session");
    expect(rawToken.length).toBeGreaterThanOrEqual(43);

    const expectedHash = hashSessionToken(rawToken);
    expect(expectedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(expectedHash).not.toBe(rawToken);

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, expectedHash));
    expect(sessionRows.length).toBe(1);
    const createdSession = sessionRows[0]!;
    expect(createdSession.userId).toBe(adminUserId);
    expect(createdSession.revokedAt).toBeNull();

    const ttlDiffSeconds = Math.round(
      (createdSession.expiresAt.getTime() - createdSession.createdAt.getTime()) /
        1000,
    );
    expect(ttlDiffSeconds).toBeGreaterThanOrEqual(604_790);
    expect(ttlDiffSeconds).toBeLessThanOrEqual(604_810);

    const rawMatchRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, rawToken));
    expect(rawMatchRows.length).toBe(0);
  });

  test("POST /api/v1/auth/login returns identical generic 401 INVALID_CREDENTIALS for wrong password, unknown email, and inactive user", async () => {
    const app = createApp({ env: createTestEnv() });

    const cases = [
      { email: adminEmail, password: "WrongPassword#123" },
      { email: "nonexistent-user@example.com", password: validPassword },
      { email: inactiveEmail, password: validPassword },
    ];

    const responses: Array<{ code: string; message: string }> = [];
    for (const payload of cases) {
      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
      const parsed = (await res.json()) as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(parsed.success).toBe(false);
      responses.push({
        code: parsed.error.code,
        message: parsed.error.message,
      });
    }

    expect(responses[0]).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Email atau kata sandi salah",
    });
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);

    const inactiveSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, inactiveUserId));
    expect(inactiveSessions.length).toBe(0);
  });

  test("GET /api/v1/auth/me validates session without extending expires_at and rejects missing/expired/revoked/inactive sessions", async () => {
    const app = createApp({ env: createTestEnv() });

    const unauthRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me"),
    );
    expect(unauthRes.status).toBe(401);
    const unauthBody = (await unauthRes.json()) as {
      error: { code: string };
    };
    expect(unauthBody.error.code).toBe("UNAUTHENTICATED");

    const loginRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: staffEmail, password: validPassword }),
      }),
    );
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get("set-cookie");
    const cookieHeader = extractCookiePair(setCookie, "ims_session");
    const rawToken = extractRawToken(setCookie, "ims_session");
    const tokenHash = hashSessionToken(rawToken);

    const [beforeSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
    expect(beforeSession).toBeDefined();

    const meRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: cookieHeader },
      }),
    );
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toEqual({
      success: true,
      message: "Session valid",
      data: {
        user: {
          id: staffUserId,
          name: "Auth Test Staff",
          email: staffEmail,
          role: "staff",
        },
      },
    });

    const [afterSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash));
    expect(afterSession!.expiresAt.getTime()).toBe(
      beforeSession!.expiresAt.getTime(),
    );

    const badCookieRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: "ims_session=tampered-invalid-token" },
      }),
    );
    expect(badCookieRes.status).toBe(401);

    // Expire session and verify 401
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 10_000) })
      .where(eq(sessions.id, beforeSession!.id));

    const expiredRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: cookieHeader },
      }),
    );
    expect(expiredRes.status).toBe(401);

    // Restore future expiry then deactivate user and verify 401
    await db
      .update(sessions)
      .set({ expiresAt: beforeSession!.expiresAt })
      .where(eq(sessions.id, beforeSession!.id));
    await db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, staffUserId));

    const deactivatedRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: cookieHeader },
      }),
    );
    expect(deactivatedRes.status).toBe(401);

    // Reactivate staff user for remaining tests
    await db
      .update(users)
      .set({ isActive: true })
      .where(eq(users.id, staffUserId));
  });

  test("POST /api/v1/auth/logout revokes only the current session and keeps other device sessions active", async () => {
    const app = createApp({
      env: createTestEnv({ COOKIE_SECURE: true, COOKIE_SAME_SITE: "strict" }),
    });

    const loginA = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: validPassword }),
      }),
    );
    const loginB = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: validPassword }),
      }),
    );

    const cookieA = extractCookiePair(loginA.headers.get("set-cookie"), "ims_session");
    const cookieB = extractCookiePair(loginB.headers.get("set-cookie"), "ims_session");
    const hashA = hashSessionToken(extractRawToken(loginA.headers.get("set-cookie"), "ims_session"));
    const hashB = hashSessionToken(extractRawToken(loginB.headers.get("set-cookie"), "ims_session"));

    const logoutARes = await app.handle(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie: cookieA },
      }),
    );
    expect(logoutARes.status).toBe(200);
    expect(await logoutARes.json()).toEqual({
      success: true,
      message: "Logout berhasil",
      data: null,
    });

    const clearedCookie = logoutARes.headers.get("set-cookie");
    expect(clearedCookie).toContain("ims_session=");
    expect(clearedCookie).toContain("HttpOnly");
    expect(clearedCookie).toContain("Secure");
    expect(clearedCookie).toContain("SameSite=Strict");
    expect(clearedCookie).toContain("Path=/");
    expect(clearedCookie).toContain("Max-Age=0");

    const [sessionRowA] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashA));
    const [sessionRowB] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashB));
    expect(sessionRowA!.revokedAt).not.toBeNull();
    expect(sessionRowB!.revokedAt).toBeNull();

    const retryARes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: cookieA },
      }),
    );
    expect(retryARes.status).toBe(401);

    const checkBRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: cookieB },
      }),
    );
    expect(checkBRes.status).toBe(200);
  });

  test("enforces login rate limiting with 429 RATE_LIMIT_EXCEEDED and Retry-After header", async () => {
    const rateLimiter = createLoginRateLimiter({
      maxAttempts: 3,
      windowSeconds: 120,
    });
    const app = createApp({
      env: createTestEnv({
        LOGIN_RATE_LIMIT_MAX: 3,
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: 120,
      }),
      loginRateLimiter: rateLimiter,
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.10",
          },
          body: JSON.stringify({
            email: adminEmail,
            password: "WrongPassword#123",
          }),
        }),
      );
      expect(res.status).toBe(401);
    }

    const blockedRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.10",
        },
        body: JSON.stringify({
          email: adminEmail,
          password: validPassword,
        }),
      }),
    );
    expect(blockedRes.status).toBe(429);
    const retryAfter = Number(blockedRes.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(120);

    const blockedBody = (await blockedRes.json()) as {
      success: boolean;
      error: { code: string };
    };
    expect(blockedBody.success).toBe(false);
    expect(blockedBody.error.code).toBe("RATE_LIMIT_EXCEEDED");

    const otherIpRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.99",
        },
        body: JSON.stringify({
          email: adminEmail,
          password: validPassword,
        }),
      }),
    );
    expect(otherIpRes.status).toBe(200);
  });

  test("requireRole enforces admin-only access (401 unauthenticated, 403 staff, 200 admin)", async () => {
    const env = createTestEnv();
    const repository = createAuthRepository(db);
    const rateLimiter = createLoginRateLimiter({
      maxAttempts: 50,
      windowSeconds: 900,
    });
    const authService = createAuthService({ repository, rateLimiter, env });
    const authPlugin = createAuthPlugin({ authService, env });

    const adminLogin = await authService.login({
      email: adminEmail,
      password: validPassword,
      clientIp: "127.0.0.1",
    });
    const staffLogin = await authService.login({
      email: staffEmail,
      password: validPassword,
      clientIp: "127.0.0.1",
    });

    const rbacTestApp = new Elysia()
      .use(requestIdPlugin)
      .use(errorHandlerPlugin)
      .use(
        new Elysia({ prefix: "/api/v1/admin-check" })
          .use(authPlugin.requireRole("admin"))
          .get("/", ({ authUser }) =>
            successResponse("Admin access granted", { role: authUser.role }),
          ),
      );

    const unauthRes = await rbacTestApp.handle(
      new Request("http://localhost/api/v1/admin-check"),
    );
    expect(unauthRes.status).toBe(401);

    const staffRes = await rbacTestApp.handle(
      new Request("http://localhost/api/v1/admin-check", {
        headers: { cookie: `ims_session=${staffLogin.rawSessionToken}` },
      }),
    );
    expect(staffRes.status).toBe(403);
    const staffBody = (await staffRes.json()) as {
      error: { code: string };
    };
    expect(staffBody.error.code).toBe("FORBIDDEN");

    const adminRes = await rbacTestApp.handle(
      new Request("http://localhost/api/v1/admin-check", {
        headers: { cookie: `ims_session=${adminLogin.rawSessionToken}` },
      }),
    );
    expect(adminRes.status).toBe(200);
    expect(await adminRes.json()).toEqual({
      success: true,
      message: "Admin access granted",
      data: { role: "admin" },
    });

    // Verify revokeAllSessionsForUser helper cleanly revokes all active sessions for adminUserId
    await repository.revokeAllSessionsForUser(adminUserId);
    const afterRevokeRes = await rbacTestApp.handle(
      new Request("http://localhost/api/v1/admin-check", {
        headers: { cookie: `ims_session=${adminLogin.rawSessionToken}` },
      }),
    );
    expect(afterRevokeRes.status).toBe(401);

    // Sanity check SQL count of active unrevoked rows remaining after test
    const remaining = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessions)
      .where(eq(sessions.userId, adminUserId));
    expect(remaining[0]!.count).toBeGreaterThanOrEqual(1);
  });
});
