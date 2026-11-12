import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createApp } from "../src/app";
import type { BackendEnv } from "../src/config/env";
import { assertSafeTestDatabaseUrl, db } from "../src/db";
import {
  categories,
  products,
  sessions,
  stockMovements,
  users,
  type UserRole,
} from "../src/db/schema";
import {
  BLOCKED_TEST_DB_URL,
  getIsolatedTestDatabaseUrl,
  validateIsolatedTestDatabaseUrl,
} from "./setup";

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
    LOGIN_RATE_LIMIT_MAX: 100,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
    ...overrides,
  };
}

function extractCookiePair(setCookieHeader: string | null, name: string): string {
  if (!setCookieHeader) {
    throw new Error("Expected Set-Cookie header");
  }
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookieHeader);
  if (!match?.[1]) {
    throw new Error(`Expected cookie ${name} in ${setCookieHeader}`);
  }
  return `${name}=${match[1]}`;
}

describe("test database isolation guards", () => {
  test("assertSafeTestDatabaseUrl allows *_test databases and blocked sentinel, rejects app DB", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/inventory_management_test",
      ),
    ).not.toThrow();
    expect(() => assertSafeTestDatabaseUrl(BLOCKED_TEST_DB_URL)).not.toThrow();

    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/inventory_management",
      ),
    ).toThrow(/Refusing to initialize PostgreSQL connection/);
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/production_db",
      ),
    ).toThrow(/non-test database/);
    expect(() => assertSafeTestDatabaseUrl("not-a-valid-url")).toThrow(
      /Invalid DATABASE_URL/,
    );
  });

  test("validateIsolatedTestDatabaseUrl enforces isolated *_test DB naming", () => {
    expect(validateIsolatedTestDatabaseUrl(undefined)).toBeNull();
    expect(validateIsolatedTestDatabaseUrl("   ")).toBeNull();
    expect(
      validateIsolatedTestDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/ims_isolated_test",
        "postgresql://postgres:postgres@localhost:5432/inventory_management",
      ),
    ).toBe("postgresql://postgres:postgres@localhost:5432/ims_isolated_test");

    expect(() =>
      validateIsolatedTestDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/inventory_management",
      ),
    ).toThrow(/Refusing to run tests/);

    expect(() =>
      validateIsolatedTestDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/custom_app",
      ),
    ).toThrow(/Refusing to run tests/);
  });

  test("getIsolatedTestDatabaseUrl falls back to blocked sentinel when DATABASE_URL_TEST is unset", () => {
    const previous = process.env.DATABASE_URL_TEST;
    try {
      delete process.env.DATABASE_URL_TEST;
      expect(getIsolatedTestDatabaseUrl()).toBe(BLOCKED_TEST_DB_URL);

      process.env.DATABASE_URL_TEST =
        "postgresql://postgres:postgres@localhost:5432/custom_suite_test";
      expect(getIsolatedTestDatabaseUrl()).toBe(
        "postgresql://postgres:postgres@localhost:5432/custom_suite_test",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL_TEST;
      } else {
        process.env.DATABASE_URL_TEST = previous;
      }
    }
  });
});

describe("cross-module concurrency invariants", () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const upperRunId = runId.toUpperCase();
  const basePassword = "ConcurrencyPassword#2026";
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];

  let app: ReturnType<typeof createApp>;
  let adminId = "";
  let adminEmail = "";
  let adminCookie = "";
  let defaultCategoryId = "";

  async function seedUser(input: {
    name: string;
    email: string;
    role: UserRole;
    isActive?: boolean;
    password?: string;
  }): Promise<string> {
    const passwordHash = await Bun.password.hash(
      input.password ?? basePassword,
      { algorithm: "argon2id" },
    );
    const [created] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: input.isActive ?? true,
      })
      .returning({ id: users.id });
    if (!created) {
      throw new Error(`Failed to seed user ${input.email}`);
    }
    createdUserIds.push(created.id);
    return created.id;
  }

  async function seedCategory(name: string, isActive = true): Promise<string> {
    const [created] = await db
      .insert(categories)
      .values({ name, isActive })
      .returning({ id: categories.id });
    if (!created) {
      throw new Error(`Failed to seed category ${name}`);
    }
    createdCategoryIds.push(created.id);
    return created.id;
  }

  async function seedProduct(input: {
    categoryId: string;
    sku: string;
    name: string;
    unit: string;
    currentStock?: string;
    minimumStock?: string;
    status?: "active" | "inactive";
  }): Promise<string> {
    const [created] = await db
      .insert(products)
      .values({
        categoryId: input.categoryId,
        sku: input.sku,
        name: input.name,
        unit: input.unit,
        purchasePrice: "10000.00",
        sellingPrice: "15000.00",
        currentStock: input.currentStock ?? "0.000",
        minimumStock: input.minimumStock ?? "0.000",
        status: input.status ?? "active",
      })
      .returning({ id: products.id });
    if (!created) {
      throw new Error(`Failed to seed product ${input.sku}`);
    }
    createdProductIds.push(created.id);
    return created.id;
  }

  async function loginAs(
    email: string,
    password = basePassword,
  ): Promise<string> {
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(res.status).toBe(200);
    return extractCookiePair(res.headers.get("set-cookie"), "ims_session");
  }

  beforeAll(async () => {
    app = createApp({ env: createTestEnv() });
    adminEmail = `conc-admin-${runId}@example.com`;
    adminId = await seedUser({
      name: `Concurrency Admin ${runId}`,
      email: adminEmail,
      role: "admin",
      isActive: true,
    });
    adminCookie = await loginAs(adminEmail);
    defaultCategoryId = await seedCategory(`Concurrency Cat ${runId}`, true);
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await db
        .delete(stockMovements)
        .where(inArray(stockMovements.productId, createdProductIds));
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(stockMovements)
        .where(inArray(stockMovements.createdBy, createdUserIds));
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

  test("1. concurrent password reset + session validation revokes sessions cleanly", async () => {
    const targetEmail = `conc-reset-sess-${runId}@example.com`;
    const targetId = await seedUser({
      name: `Target Reset Session ${runId}`,
      email: targetEmail,
      role: "staff",
    });
    const targetCookie = await loginAs(targetEmail);

    const resetPromise = app.handle(
      new Request(`http://localhost/api/v1/users/${targetId}/password`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ newPassword: "ResetConcurrency#2026" }),
      }),
    );

    const validationResponses = await Promise.all([
      resetPromise,
      app.handle(
        new Request("http://localhost/api/v1/auth/me", {
          headers: { cookie: targetCookie },
        }),
      ),
      app.handle(
        new Request("http://localhost/api/v1/categories", {
          headers: { cookie: targetCookie },
        }),
      ),
    ]);

    expect(validationResponses[0].status).toBe(200);
    for (const authCheckRes of validationResponses.slice(1)) {
      expect([200, 401]).toContain(authCheckRes.status);
    }

    const activeSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, targetId), isNull(sessions.revokedAt)));
    expect(activeSessions).toHaveLength(0);

    const afterResetRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: targetCookie },
      }),
    );
    expect(afterResetRes.status).toBe(401);
  });

  test("2. concurrent password reset + user deactivation keeps inactive state and zero active sessions", async () => {
    const targetEmail = `conc-reset-deact-${runId}@example.com`;
    const targetId = await seedUser({
      name: `Target Reset Deact ${runId}`,
      email: targetEmail,
      role: "staff",
    });
    const targetCookie = await loginAs(targetEmail);
    const rotatedPassword = "RotatedConcurrency#2026";

    const [resetRes, deactivateRes] = await Promise.all([
      app.handle(
        new Request(`http://localhost/api/v1/users/${targetId}/password`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({ newPassword: rotatedPassword }),
        }),
      ),
      app.handle(
        new Request(`http://localhost/api/v1/users/${targetId}/status`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({ isActive: false }),
        }),
      ),
    ]);

    expect(resetRes.status).toBe(200);
    expect(deactivateRes.status).toBe(200);

    const [userRow] = await db
      .select({ isActive: users.isActive, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, targetId));
    expect(userRow?.isActive).toBe(false);
    expect(
      await Bun.password.verify(rotatedPassword, userRow!.passwordHash),
    ).toBe(true);

    const remainingSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, targetId), isNull(sessions.revokedAt)));
    expect(remainingSessions).toHaveLength(0);

    const oldCookieRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: targetCookie },
      }),
    );
    expect(oldCookieRes.status).toBe(401);

    const loginAttempt = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          password: rotatedPassword,
        }),
      }),
    );
    expect(loginAttempt.status).toBe(401);
  });

  test("3. concurrent stock out + product deactivation never causes negative stock or orphan movements", async () => {
    const productId = await seedProduct({
      categoryId: defaultCategoryId,
      sku: `CONC-OUT-${upperRunId}`,
      name: `Race Stock Out Deactivate ${runId}`,
      unit: "pcs",
      currentStock: "10.000",
      minimumStock: "2.000",
      status: "active",
    });

    const [deactivateRes, ...stockOutResponses] = await Promise.all([
      app.handle(
        new Request(`http://localhost/api/v1/products/${productId}/status`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({ status: "inactive" }),
        }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        app.handle(
          new Request("http://localhost/api/v1/stock-movements", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: adminCookie,
            },
            body: JSON.stringify({
              productId,
              type: "out",
              quantity: "4",
              reason: `Concurrent out #${index + 1}`,
            }),
          }),
        ),
      ),
    ]);

    expect(deactivateRes.status).toBe(200);

    let succeededCount = 0;
    for (const res of stockOutResponses) {
      if (res.status === 201) {
        succeededCount += 1;
      } else {
        expect(res.status).toBe(422);
        const body = (await res.json()) as { error: { code: string } };
        expect(["INACTIVE_PRODUCT", "INSUFFICIENT_STOCK"]).toContain(
          body.error.code,
        );
      }
    }
    expect(succeededCount).toBeLessThanOrEqual(2);

    const [productRow] = await db
      .select({
        currentStock: products.currentStock,
        status: products.status,
      })
      .from(products)
      .where(eq(products.id, productId));
    expect(productRow?.status).toBe("inactive");
    expect(Number(productRow?.currentStock)).toBe(10 - succeededCount * 4);
    expect(Number(productRow?.currentStock)).toBeGreaterThanOrEqual(0);

    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    expect(movements).toHaveLength(succeededCount);

    // Subsequent Stock Out after deactivation is guaranteed 422 INACTIVE_PRODUCT
    const afterDeactOut = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          productId,
          type: "out",
          quantity: "1",
          reason: "After deactivation",
        }),
      }),
    );
    expect(afterDeactOut.status).toBe(422);
  });

  test("4. concurrent product update (metadata & unit) + stock in maintains unit/stock invariant", async () => {
    const productId = await seedProduct({
      categoryId: defaultCategoryId,
      sku: `CONC-UNIT-${upperRunId}`,
      name: `Race Unit StockIn ${runId}`,
      unit: "kg",
      currentStock: "0.000",
      minimumStock: "0.000",
      status: "active",
    });

    const [patchUnitRes, stockInFractionalRes, patchMetaRes] =
      await Promise.all([
        app.handle(
          new Request(`http://localhost/api/v1/products/${productId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: adminCookie,
            },
            body: JSON.stringify({
              unit: "pcs",
              name: `Updated Unit Name ${runId}`,
            }),
          }),
        ),
        app.handle(
          new Request("http://localhost/api/v1/stock-movements", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: adminCookie,
            },
            body: JSON.stringify({
              productId,
              type: "in",
              quantity: "1.25",
              reason: "Concurrent fractional stock in",
            }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/products/${productId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: adminCookie,
            },
            body: JSON.stringify({
              description: "Concurrent metadata patch",
            }),
          }),
        ),
      ]);

    expect(patchMetaRes.status).toBe(200);
    expect([200, 422]).toContain(patchUnitRes.status);
    expect([201, 422]).toContain(stockInFractionalRes.status);

    const [productRow] = await db
      .select({
        unit: products.unit,
        currentStock: products.currentStock,
        description: products.description,
      })
      .from(products)
      .where(eq(products.id, productId));
    expect(productRow?.description).toBe("Concurrent metadata patch");

    const movements = await db
      .select({ quantity: stockMovements.quantity })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));

    // Either unit switched to "pcs" before stockIn (rejecting 1.25 fractional quantity -> 0 stock)
    // OR stockIn executed first (blocking unit switch -> unit stays "kg" with 1.250 stock).
    if (productRow?.unit === "pcs") {
      expect(patchUnitRes.status).toBe(200);
      expect(stockInFractionalRes.status).toBe(422);
      expect(productRow.currentStock).toBe("0.000");
      expect(movements).toHaveLength(0);
    } else {
      expect(productRow?.unit).toBe("kg");
      expect(stockInFractionalRes.status).toBe(201);
      expect(patchUnitRes.status).toBe(422);
      expect(productRow?.currentStock).toBe("1.250");
      expect(movements).toHaveLength(1);
    }
  });

  test("5. concurrent category deactivation + product creation/category reassignment blocks stale active assignment", async () => {
    const targetCategoryId = await seedCategory(
      `Race Cat Deactivate ${runId}`,
      true,
    );
    const existingProductId = await seedProduct({
      categoryId: defaultCategoryId,
      sku: `CONC-REASSIGN-${upperRunId}`,
      name: `Reassign Cat Item ${runId}`,
      unit: "pcs",
      currentStock: "0.000",
    });

    const createSku = `CONC-CAT-${upperRunId}`;
    const [deactivateCatRes, createProductRes, reassignProductRes] =
      await Promise.all([
        app.handle(
          new Request(
            `http://localhost/api/v1/categories/${targetCategoryId}/status`,
            {
              method: "PATCH",
              headers: {
                "content-type": "application/json",
                cookie: adminCookie,
              },
              body: JSON.stringify({ isActive: false }),
            },
          ),
        ),
        app.handle(
          new Request("http://localhost/api/v1/products", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: adminCookie,
            },
            body: JSON.stringify({
              categoryId: targetCategoryId,
              sku: createSku,
              name: "Race Created With Category",
              unit: "pcs",
              purchasePrice: "5000.00",
              sellingPrice: "7000.00",
            }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/products/${existingProductId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: adminCookie,
            },
            body: JSON.stringify({ categoryId: targetCategoryId }),
          }),
        ),
      ]);

    expect(deactivateCatRes.status).toBe(200);
    expect([201, 422]).toContain(createProductRes.status);
    expect([200, 422]).toContain(reassignProductRes.status);

    if (createProductRes.status === 201) {
      const createdBody = (await createProductRes.json()) as {
        data: { id: string };
      };
      createdProductIds.push(createdBody.data.id);
    } else {
      const errBody = (await createProductRes.json()) as {
        error: { code: string };
      };
      expect(errBody.error.code).toBe("INACTIVE_CATEGORY");
    }

    if (reassignProductRes.status === 422) {
      const errBody = (await reassignProductRes.json()) as {
        error: { code: string };
      };
      expect(errBody.error.code).toBe("INACTIVE_CATEGORY");
    }

    // After deactivation completes, assigning an inactive category must always fail with 422 INACTIVE_CATEGORY
    const postDeactCreate = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: targetCategoryId,
          sku: `CONC-CAT-AFTER-${upperRunId}`,
          name: "Must Fail Inactive Category",
          unit: "pcs",
          purchasePrice: "5000.00",
          sellingPrice: "7000.00",
        }),
      }),
    );
    expect(postDeactCreate.status).toBe(422);
    const postDeactBody = (await postDeactCreate.json()) as {
      error: { code: string };
    };
    expect(postDeactBody.error.code).toBe("INACTIVE_CATEGORY");
  });

  test("6. concurrent user deactivation + authenticated stock movement preserves stock/history consistency and kills session", async () => {
    const actorEmail = `conc-actor-${runId}@example.com`;
    const actorId = await seedUser({
      name: `Concurrent Actor ${runId}`,
      email: actorEmail,
      role: "staff",
    });
    const actorCookie = await loginAs(actorEmail);
    const productId = await seedProduct({
      categoryId: defaultCategoryId,
      sku: `CONC-ACT-${upperRunId}`,
      name: `Actor Deactivation Item ${runId}`,
      unit: "pcs",
      currentStock: "5.000",
    });

    const [deactivateActorRes, ...movementResponses] = await Promise.all([
      app.handle(
        new Request(`http://localhost/api/v1/users/${actorId}/status`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: adminCookie,
          },
          body: JSON.stringify({ isActive: false }),
        }),
      ),
      ...Array.from({ length: 3 }, (_, idx) =>
        app.handle(
          new Request("http://localhost/api/v1/stock-movements", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: actorCookie,
            },
            body: JSON.stringify({
              productId,
              type: "in",
              quantity: "2",
              reason: `Actor concurrent move #${idx + 1}`,
            }),
          }),
        ),
      ),
    ]);

    expect(deactivateActorRes.status).toBe(200);

    let acceptedCount = 0;
    for (const res of movementResponses) {
      if (res.status === 201) {
        acceptedCount += 1;
      } else {
        expect(res.status).toBe(401);
      }
    }

    const [productRow] = await db
      .select({ currentStock: products.currentStock })
      .from(products)
      .where(eq(products.id, productId));
    expect(Number(productRow?.currentStock)).toBe(5 + acceptedCount * 2);

    const movements = await db
      .select({ createdBy: stockMovements.createdBy })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    expect(movements).toHaveLength(acceptedCount);
    for (const m of movements) {
      expect(m.createdBy).toBe(actorId);
    }

    const postDeactMove = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: actorCookie,
        },
        body: JSON.stringify({
          productId,
          type: "in",
          quantity: "1",
          reason: "Must fail after user deactivation",
        }),
      }),
    );
    expect(postDeactMove.status).toBe(401);
  });

  test("7. concurrent cross-module admin role demotion + admin deactivation preserves at least one active admin", async () => {
    const adminAEmail = `conc-adm-a-${runId}@example.com`;
    const adminBEmail = `conc-adm-b-${runId}@example.com`;
    const adminAId = await seedUser({
      name: `Concurrent Admin A ${runId}`,
      email: adminAEmail,
      role: "admin",
      isActive: true,
    });
    const adminBId = await seedUser({
      name: `Concurrent Admin B ${runId}`,
      email: adminBEmail,
      role: "admin",
      isActive: true,
    });
    const cookieA = await loginAs(adminAEmail);
    const cookieB = await loginAs(adminBEmail);

    try {
      const [demoteBRes, deactivateARes] = await Promise.all([
        app.handle(
          new Request(`http://localhost/api/v1/users/${adminBId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: cookieA,
            },
            body: JSON.stringify({ role: "staff" }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/users/${adminAId}/status`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: cookieB,
            },
            body: JSON.stringify({ isActive: false }),
          }),
        ),
      ]);

      expect([200, 422]).toContain(demoteBRes.status);
      expect([200, 422]).toContain(deactivateARes.status);
      // At least one succeeds; if no other active admins exist outside fixtures,
      // both cannot remove the last active admin simultaneously.
      expect(
        demoteBRes.status === 200 || deactivateARes.status === 200,
      ).toBe(true);

      const remainingActiveAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
      expect(remainingActiveAdmins.length).toBeGreaterThanOrEqual(1);

      const [stateA] = await db
        .select({ role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, adminAId));
      if (!stateA?.isActive) {
        const revokedARes = await app.handle(
          new Request("http://localhost/api/v1/auth/me", {
            headers: { cookie: cookieA },
          }),
        );
        expect(revokedARes.status).toBe(401);
      }
    } finally {
      // Restore primary admin and cleanup temporary admins so no external admin state leaks
      await db
        .update(users)
        .set({ role: "admin", isActive: true, updatedAt: new Date() })
        .where(eq(users.id, adminAId));
      await db
        .update(users)
        .set({ role: "staff", isActive: false, updatedAt: new Date() })
        .where(eq(users.id, adminBId));
    }
  });
});
