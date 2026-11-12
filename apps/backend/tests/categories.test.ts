import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { createApp } from "../src/app";
import type { BackendEnv } from "../src/config/env";
import { db } from "../src/db";
import { categories, sessions, users, type UserRole } from "../src/db/schema";

function createTestEnv(): BackendEnv {
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

describe("categories API endpoints", () => {
  const app = createApp({ env: createTestEnv() });
  const runId = crypto.randomUUID().slice(0, 8);
  const password = "CategoryTestPassword#2026";
  const adminEmail = `cat-admin-${runId}@example.com`;
  const staffEmail = `cat-staff-${runId}@example.com`;

  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let adminCookie = "";
  let staffCookie = "";

  async function seedUser(email: string, role: UserRole): Promise<string> {
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });
    const rows = await db
      .insert(users)
      .values({
        name: `Category ${role} ${runId}`,
        email,
        passwordHash,
        role,
        isActive: true,
      })
      .returning({ id: users.id });

    const created = rows[0]!;
    createdUserIds.push(created.id);
    return created.id;
  }

  async function loginAs(email: string): Promise<string> {
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(res.status).toBe(200);
    return extractCookiePair(res.headers.get("set-cookie"));
  }

  beforeAll(async () => {
    await seedUser(adminEmail, "admin");
    await seedUser(staffEmail, "staff");
    adminCookie = await loginAs(adminEmail);
    staffCookie = await loginAs(staffEmail);
  });

  afterAll(async () => {
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

  test("enforces Admin-only mutations and Staff active-only visibility", async () => {
    // Staff cannot create category
    const staffCreateRes = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: staffCookie,
        },
        body: JSON.stringify({ name: `Staff Attempt ${runId}` }),
      }),
    );
    expect(staffCreateRes.status).toBe(403);

    // Admin creates category preserving case after trim & blank description -> null
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `  Elektronik Kantor ${runId}  `,
          description: "   ",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as {
      success: boolean;
      data: {
        id: string;
        name: string;
        description: string | null;
        isActive: boolean;
        updatedAt: string;
      };
    };
    expect(createdBody.data.name).toBe(`Elektronik Kantor ${runId}`);
    expect(createdBody.data.description).toBeNull();
    expect(createdBody.data.isActive).toBe(true);
    const categoryId = createdBody.data.id;
    createdCategoryIds.push(categoryId);

    // Duplicate case-insensitive trimmed name returns 409 DUPLICATE_CATEGORY_NAME
    const duplicateRes = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `elektronik kantor ${runId.toUpperCase()}`,
        }),
      }),
    );
    expect(duplicateRes.status).toBe(409);
    const dupBody = (await duplicateRes.json()) as { error: { code: string } };
    expect(dupBody.error.code).toBe("DUPLICATE_CATEGORY_NAME");

    // Staff cannot filter isActive=false on GET /categories
    const staffInactiveFilterRes = await app.handle(
      new Request("http://localhost/api/v1/categories?isActive=false", {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffInactiveFilterRes.status).toBe(403);

    // Staff can read active category
    const staffDetailActiveRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}`, {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffDetailActiveRes.status).toBe(200);

    // Admin updates description then clears with empty string
    const emptyPatchRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(emptyPatchRes.status).toBe(400);

    const patchRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `Peralatan Kantor ${runId}`,
          description: "Aset elektronik kantor",
        }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as {
      data: { name: string; description: string | null };
    };
    expect(patchBody.data.name).toBe(`Peralatan Kantor ${runId}`);
    expect(patchBody.data.description).toBe("Aset elektronik kantor");

    const clearDescRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ description: null }),
      }),
    );
    expect(clearDescRes.status).toBe(200);
    const clearDescBody = (await clearDescRes.json()) as {
      data: { description: string | null };
    };
    expect(clearDescBody.data.description).toBeNull();

    // Admin deactivates category
    const deactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(deactivateRes.status).toBe(200);
    const deactivatedBody = (await deactivateRes.json()) as {
      data: { isActive: boolean; updatedAt: string };
    };
    expect(deactivatedBody.data.isActive).toBe(false);

    // Repeat deactivation is idempotent and does not change updatedAt
    const repeatDeactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(repeatDeactivateRes.status).toBe(200);
    const repeatBody = (await repeatDeactivateRes.json()) as {
      data: { updatedAt: string };
    };
    expect(repeatBody.data.updatedAt).toBe(deactivatedBody.data.updatedAt);

    // Staff cannot view inactive category detail (403) and does not see it in list
    const staffDetailInactiveRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${categoryId}`, {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffDetailInactiveRes.status).toBe(403);

    const staffListRes = await app.handle(
      new Request(
        `http://localhost/api/v1/categories?search=${encodeURIComponent(runId)}`,
        { headers: { cookie: staffCookie } },
      ),
    );
    expect(staffListRes.status).toBe(200);
    const staffListBody = (await staffListRes.json()) as {
      data: Array<{ id: string }>;
    };
    expect(staffListBody.data).toEqual([]);

    // Admin still sees inactive category when querying isActive=false
    const adminListInactiveRes = await app.handle(
      new Request(
        `http://localhost/api/v1/categories?isActive=false&search=${encodeURIComponent(runId)}`,
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(adminListInactiveRes.status).toBe(200);
    const adminListBody = (await adminListInactiveRes.json()) as {
      data: Array<{ id: string }>;
    };
    expect(adminListBody.data.map((c) => c.id)).toEqual([categoryId]);
  });

  test("rejects unknown properties on category payloads with 400 VALIDATION_ERROR", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `Strict Category ${runId}`,
          extraField: "unexpected",
        }),
      }),
    );
    expect(createRes.status).toBe(400);
    const createBody = (await createRes.json()) as { error: { code: string } };
    expect(createBody.error.code).toBe("VALIDATION_ERROR");

    const dummyCategoryId = "00000000-0000-4000-8000-000000000001";
    const updateRes = await app.handle(
      new Request(`http://localhost/api/v1/categories/${dummyCategoryId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `Updated Category ${runId}`,
          extraField: "unexpected",
        }),
      }),
    );
    expect(updateRes.status).toBe(400);
    const updateBody = (await updateRes.json()) as { error: { code: string } };
    expect(updateBody.error.code).toBe("VALIDATION_ERROR");

    const statusRes = await app.handle(
      new Request(
        `http://localhost/api/v1/categories/${dummyCategoryId}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({
            isActive: false,
            extraField: "unexpected",
          }),
        },
      ),
    );
    expect(statusRes.status).toBe(400);
    const statusBody = (await statusRes.json()) as { error: { code: string } };
    expect(statusBody.error.code).toBe("VALIDATION_ERROR");
  });
});
