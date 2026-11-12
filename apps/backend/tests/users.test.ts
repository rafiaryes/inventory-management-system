import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../src/app";
import type { BackendEnv } from "../src/config/env";
import { db } from "../src/db";
import { sessions, users, type UserRole } from "../src/db/schema";

function createTestEnv(): BackendEnv {
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
    LOGIN_RATE_LIMIT_MAX: 100,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
  };
}

function extractCookiePair(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("Expected Set-Cookie header");
  }
  const match = /ims_session=([^;]+)/.exec(setCookieHeader);
  if (!match?.[1]) {
    throw new Error(`Missing ims_session cookie in: ${setCookieHeader}`);
  }
  return `ims_session=${match[1]}`;
}

describe("users API endpoints", () => {
  const app = createApp({ env: createTestEnv() });
  const runId = crypto.randomUUID().slice(0, 8);
  const password = "UserTestPassword#2026";
  const adminEmail = `users-admin-${runId}@example.com`;
  const staffEmail = `users-staff-${runId}@example.com`;

  const createdUserIds: string[] = [];
  let adminId = "";
  let staffId = "";
  let adminCookie = "";
  let staffCookie = "";

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

  async function loginAs(email: string, pw = password): Promise<string> {
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      }),
    );
    expect(res.status).toBe(200);
    return extractCookiePair(res.headers.get("set-cookie"));
  }

  beforeAll(async () => {
    adminId = await seedUser({
      name: `Admin Primary ${runId}`,
      email: adminEmail,
      role: "admin",
      isActive: true,
    });
    staffId = await seedUser({
      name: `Staff Reader ${runId}`,
      email: staffEmail,
      role: "staff",
      isActive: true,
    });

    adminCookie = await loginAs(adminEmail);
    staffCookie = await loginAs(staffEmail);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  test("rejects unauthenticated (401) and staff (403) access on user management endpoints", async () => {
    const unauthRes = await app.handle(
      new Request("http://localhost/api/v1/users"),
    );
    expect(unauthRes.status).toBe(401);

    const staffListRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffListRes.status).toBe(403);

    const staffCreateRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: staffCookie,
        },
        body: JSON.stringify({
          name: "Blocked",
          email: `blocked-${runId}@example.com`,
          password,
          role: "staff",
        }),
      }),
    );
    expect(staffCreateRes.status).toBe(403);
  });

  test("Admin creates, lists, searches, sorts, fetches detail, and rejects duplicate emails / whitespace passwords", async () => {
    const createdEmail = `users-new-${runId}@example.com`;
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `  Staff Gudang 100% ${runId}  `,
          email: `  ${createdEmail.toUpperCase()}  `,
          password,
          role: "staff",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as {
      success: boolean;
      data: {
        id: string;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
      };
    };
    expect(createBody.success).toBe(true);
    expect(createBody.data.name).toBe(`Staff Gudang 100% ${runId}`);
    expect(createBody.data.email).toBe(createdEmail);
    expect(createBody.data.role).toBe("staff");
    expect(createBody.data.isActive).toBe(true);
    expect("passwordHash" in createBody.data).toBe(false);
    createdUserIds.push(createBody.data.id);

    const duplicateRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Duplicate Email User",
          email: createdEmail.toUpperCase(),
          password,
          role: "staff",
        }),
      }),
    );
    expect(duplicateRes.status).toBe(409);
    const dupBody = (await duplicateRes.json()) as { error: { code: string } };
    expect(dupBody.error.code).toBe("DUPLICATE_EMAIL");

    const blankPassRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Blank Password",
          email: `blank-${runId}@example.com`,
          password: "        ",
          role: "staff",
        }),
      }),
    );
    expect(blankPassRes.status).toBe(400);

    const listRes = await app.handle(
      new Request(
        `http://localhost/api/v1/users?search=${encodeURIComponent(`100% ${runId}`)}&role=staff&isActive=true&sortBy=name&sortOrder=asc`,
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string }>;
      meta: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
    expect(listBody.data.map((u) => u.id)).toEqual([createBody.data.id]);
    expect(listBody.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });

    const invalidSortRes = await app.handle(
      new Request("http://localhost/api/v1/users?sortBy=passwordHash", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(invalidSortRes.status).toBe(400);

    const detailRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${createBody.data.id}`, {
        headers: { cookie: adminCookie },
      }),
    );
    expect(detailRes.status).toBe(200);

    const missingDetailRes = await app.handle(
      new Request(
        "http://localhost/api/v1/users/00000000-0000-4000-8000-000000000000",
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(missingDetailRes.status).toBe(404);
  });

  test("enforces self/last-admin guards, revokes sessions on deactivation/password reset, and handles idempotent status", async () => {
    const emptyPatchRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(emptyPatchRes.status).toBe(400);

    // Self-demotion blocked (422)
    const selfDemoteRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ role: "staff" }),
      }),
    );
    expect(selfDemoteRes.status).toBe(422);

    // Self-deactivation blocked (422)
    const selfDeactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(selfDeactivateRes.status).toBe(422);

    // Create a second active Admin and verify last-active-admin protection when trying from another Admin
    const secondAdminEmail = `users-admin2-${runId}@example.com`;
    const secondAdminId = await seedUser({
      name: `Admin Secondary ${runId}`,
      email: secondAdminEmail,
      role: "admin",
      isActive: true,
    });
    const secondAdminCookie = await loginAs(secondAdminEmail);

    // Second admin deactivates primary admin -> allowed because second admin remains active
    const deactivatePrimaryRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(deactivatePrimaryRes.status).toBe(200);
    const deactivatedData = (await deactivatePrimaryRes.json()) as {
      data: { isActive: boolean; updatedAt: string };
    };
    expect(deactivatedData.data.isActive).toBe(false);

    // Primary admin's old session is revoked and cannot authenticate
    const revokedMeRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(revokedMeRes.status).toBe(401);

    // Idempotent repeat deactivation keeps updatedAt unchanged
    const repeatDeactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(repeatDeactivateRes.status).toBe(200);
    const repeatBody = (await repeatDeactivateRes.json()) as {
      data: { updatedAt: string };
    };
    expect(repeatBody.data.updatedAt).toBe(deactivatedData.data.updatedAt);

    // Even when primary admin is inactive, second admin still cannot self-demote or self-deactivate
    const lastAdminDemoteRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${secondAdminId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ role: "staff" }),
      }),
    );
    expect(lastAdminDemoteRes.status).toBe(422);

    // Reactivate primary admin: old revoked session MUST stay dead
    const reactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ isActive: true }),
      }),
    );
    expect(reactivateRes.status).toBe(200);
    const oldSessionAfterReactivate = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(oldSessionAfterReactivate.status).toBe(401);

    // Promote staff to admin, then reset password of secondAdmin via primary admin, then test self-password reset clears cookie
    const newPrimaryCookie = await loginAs(adminEmail);
    const resetOtherRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${secondAdminId}/password`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: newPrimaryCookie,
        },
        body: JSON.stringify({ newPassword: "NewStrongPassword#99" }),
      }),
    );
    expect(resetOtherRes.status).toBe(200);

    // Second admin's session must be revoked after password reset
    const secondMeAfterReset = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: secondAdminCookie },
      }),
    );
    expect(secondMeAfterReset.status).toBe(401);

    // Self password reset revokes sessions AND emits cleared Set-Cookie header
    const selfResetRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/password`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: newPrimaryCookie,
        },
        body: JSON.stringify({ newPassword: "SelfResetPassword#99" }),
      }),
    );
    expect(selfResetRes.status).toBe(200);
    expect(selfResetRes.headers.get("set-cookie")).toContain("Max-Age=0");

    const activeSessionsAfterSelfReset = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, adminId));
    expect(
      activeSessionsAfterSelfReset.every((row) => row.revokedAt !== null),
    ).toBe(true);

    // Can login with new password
    adminCookie = await loginAs(adminEmail, "SelfResetPassword#99");
    expect(adminCookie).toContain("ims_session=");
  });
});
