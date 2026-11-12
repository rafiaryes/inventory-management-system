import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createApp } from "../src/app";
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

describe("stock movements API endpoints", () => {
  const app = createApp({ env: createTestEnv() });
  const runId = crypto.randomUUID().slice(0, 8);
  const upperRunId = runId.toUpperCase();
  const password = "MovementTestPassword#2026";
  const adminEmail = `move-admin-${runId}@example.com`;
  const staffEmail = `move-staff-${runId}@example.com`;

  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdMovementIds: string[] = [];

  let adminId = "";
  let staffId = "";
  let adminCookie = "";
  let staffCookie = "";
  let pcsProductId = "";
  let kgProductId = "";
  let inactiveProductId = "";
  let raceProductId = "";
  let maxStockProductId = "";
  let firstPcsMovementId = "";
  let firstPcsCreatedAt = "";
  let staffOutCreatedAt = "";

  async function seedUser(email: string, role: UserRole): Promise<string> {
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });
    const rows = await db
      .insert(users)
      .values({
        name: `Movement ${role} ${runId}`,
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

  async function login(email: string): Promise<string> {
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(response.status).toBe(200);
    return extractCookiePair(response.headers.get("set-cookie"));
  }

  beforeAll(async () => {
    adminId = await seedUser(adminEmail, "admin");
    staffId = await seedUser(staffEmail, "staff");
    adminCookie = await login(adminEmail);
    staffCookie = await login(staffEmail);

    const catRows = await db
      .insert(categories)
      .values({ name: `Movement Category ${runId}`, isActive: true })
      .returning({ id: categories.id });
    const categoryId = catRows[0]!.id;
    createdCategoryIds.push(categoryId);

    const insertedProducts = await db
      .insert(products)
      .values([
        {
          categoryId,
          sku: `MV-PCS-${upperRunId}`,
          name: "Mouse Office",
          unit: "pcs",
          purchasePrice: "50000.00",
          sellingPrice: "75000.00",
          currentStock: "0.000",
          minimumStock: "5.000",
          status: "active",
        },
        {
          categoryId,
          sku: `MV-KG-${upperRunId}`,
          name: "Tepung Terigu",
          unit: "kg",
          purchasePrice: "10000.00",
          sellingPrice: "15000.00",
          currentStock: "0.000",
          minimumStock: "1.500",
          status: "active",
        },
        {
          categoryId,
          sku: `MV-INACT-${upperRunId}`,
          name: "Produk Nonaktif",
          unit: "pcs",
          purchasePrice: "20000.00",
          sellingPrice: "30000.00",
          currentStock: "5.000",
          minimumStock: "1.000",
          status: "inactive",
        },
        {
          categoryId,
          sku: `MV-RACE-${upperRunId}`,
          name: "Race Condition Item",
          unit: "pcs",
          purchasePrice: "10000.00",
          sellingPrice: "20000.00",
          currentStock: "10.000",
          minimumStock: "2.000",
          status: "active",
        },
        {
          categoryId,
          sku: `MV-MAX-${upperRunId}`,
          name: "Max Limit Item",
          unit: "kg",
          purchasePrice: "1000.00",
          sellingPrice: "2000.00",
          currentStock: "99999999999.000",
          minimumStock: "0.000",
          status: "active",
        },
      ])
      .returning({ id: products.id, sku: products.sku });

    for (const row of insertedProducts) {
      createdProductIds.push(row.id);
      if (row.sku.startsWith("MV-PCS-")) pcsProductId = row.id;
      if (row.sku.startsWith("MV-KG-")) kgProductId = row.id;
      if (row.sku.startsWith("MV-INACT-")) inactiveProductId = row.id;
      if (row.sku.startsWith("MV-RACE-")) raceProductId = row.id;
      if (row.sku.startsWith("MV-MAX-")) maxStockProductId = row.id;
    }
  });

  afterAll(async () => {
    if (createdMovementIds.length > 0) {
      await db
        .delete(stockMovements)
        .where(inArray(stockMovements.id, createdMovementIds));
    }
    if (createdProductIds.length > 0) {
      await db
        .delete(stockMovements)
        .where(inArray(stockMovements.productId, createdProductIds));
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

  test("unauthenticated requests are rejected with 401", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/stock-movements"),
    );
    expect(res.status).toBe(401);
  });

  test("creates Stock In and Stock Out atomically without exposing prices", async () => {
    const stockInRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          productId: pcsProductId,
          type: "in",
          quantity: "10",
          reason: "  Pembelian awal supplier  ",
          notes: "   ",
        }),
      }),
    );

    expect(stockInRes.status).toBe(201);
    const inBody = (await stockInRes.json()) as {
      data: Record<string, unknown>;
    };
    createdMovementIds.push(inBody.data.id as string);
    firstPcsMovementId = inBody.data.id as string;
    firstPcsCreatedAt = inBody.data.createdAt as string;

    expect(inBody.data).toMatchObject({
      type: "in",
      quantity: "10.000",
      stockBefore: "0.000",
      stockAfter: "10.000",
      reason: "Pembelian awal supplier",
      notes: null,
      product: {
        id: pcsProductId,
        sku: `MV-PCS-${upperRunId}`,
        unit: "pcs",
        status: "active",
      },
      createdBy: {
        id: adminId,
      },
    });
    expect("purchasePrice" in inBody.data).toBe(false);
    expect("sellingPrice" in inBody.data).toBe(false);
    expect("purchasePrice" in (inBody.data.product as object)).toBe(false);

    const stockOutRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: staffCookie,
        },
        body: JSON.stringify({
          productId: pcsProductId,
          type: "out",
          quantity: "4",
          reason: "Penjualan harian",
          notes: "  Order #101  ",
        }),
      }),
    );

    expect(stockOutRes.status).toBe(201);
    const outBody = (await stockOutRes.json()) as {
      data: Record<string, unknown>;
    };
    createdMovementIds.push(outBody.data.id as string);
    staffOutCreatedAt = outBody.data.createdAt as string;

    expect(outBody.data).toMatchObject({
      type: "out",
      quantity: "4.000",
      stockBefore: "10.000",
      stockAfter: "6.000",
      reason: "Penjualan harian",
      notes: "Order #101",
      createdBy: {
        id: staffId,
      },
    });

    const dbProduct = await db
      .select({ currentStock: products.currentStock })
      .from(products)
      .where(eq(products.id, pcsProductId));
    expect(dbProduct[0]?.currentStock).toBe("6.000");
  });

  test("supports 3 decimal places on non-count-only units and rejects invalid quantities", async () => {
    const kgIn = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: staffCookie,
        },
        body: JSON.stringify({
          productId: kgProductId,
          type: "in",
          quantity: "2.375",
          reason: "Restok bahan",
        }),
      }),
    );
    expect(kgIn.status).toBe(201);
    const kgInBody = (await kgIn.json()) as { data: { id: string; stockAfter: string } };
    createdMovementIds.push(kgInBody.data.id);
    expect(kgInBody.data.stockAfter).toBe("2.375");

    const kgOut = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          productId: kgProductId,
          type: "out",
          quantity: "1.125",
          reason: "Produksi roti",
        }),
      }),
    );
    expect(kgOut.status).toBe(201);
    const kgOutBody = (await kgOut.json()) as { data: { id: string; stockAfter: string } };
    createdMovementIds.push(kgOutBody.data.id);
    expect(kgOutBody.data.stockAfter).toBe("1.250");

    // Count-only fractional rejected with 422 INVALID_UNIT_QUANTITY
    const fractionalPcs = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          productId: pcsProductId,
          type: "in",
          quantity: "1.5",
          reason: "Invalid fractional pcs",
        }),
      }),
    );
    expect(fractionalPcs.status).toBe(422);
    expect(((await fractionalPcs.json()) as { error: { code: string } }).error.code).toBe(
      "INVALID_UNIT_QUANTITY",
    );

    // Zero or negative quantity -> 422 BUSINESS_RULE_VIOLATION
    for (const badQty of ["0", "-2"]) {
      const zeroRes = await app.handle(
        new Request("http://localhost/api/v1/stock-movements", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({
            productId: pcsProductId,
            type: "in",
            quantity: badQty,
            reason: "Non-positive test",
          }),
        }),
      );
      expect(zeroRes.status).toBe(422);
      expect(((await zeroRes.json()) as { error: { code: string } }).error.code).toBe(
        "BUSINESS_RULE_VIOLATION",
      );
    }

    // Excess decimal precision or invalid format -> 400 VALIDATION_ERROR
    for (const malformedQty of ["1.2345", "abc"]) {
      const badFormatRes = await app.handle(
        new Request("http://localhost/api/v1/stock-movements", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({
            productId: kgProductId,
            type: "in",
            quantity: malformedQty,
            reason: "Precision check",
          }),
        }),
      );
      expect(badFormatRes.status).toBe(400);
    }

    // Blank reason -> 400 VALIDATION_ERROR
    const blankReasonRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          productId: pcsProductId,
          type: "in",
          quantity: "1",
          reason: "   ",
        }),
      }),
    );
    expect(blankReasonRes.status).toBe(400);

    // Overflow > 99999999999.999 -> 422 BUSINESS_RULE_VIOLATION
    const overflowRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          productId: maxStockProductId,
          type: "in",
          quantity: "2.000",
          reason: "Overflow check",
        }),
      }),
    );
    expect(overflowRes.status).toBe(422);
    expect(((await overflowRes.json()) as { error: { code: string } }).error.code).toBe(
      "BUSINESS_RULE_VIOLATION",
    );

    // Insufficient stock -> 422 INSUFFICIENT_STOCK
    const insufficientRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: staffCookie },
        body: JSON.stringify({
          productId: pcsProductId,
          type: "out",
          quantity: "99",
          reason: "Over stock check",
        }),
      }),
    );
    expect(insufficientRes.status).toBe(422);
    expect(((await insufficientRes.json()) as { error: { code: string } }).error.code).toBe(
      "INSUFFICIENT_STOCK",
    );

    // Inactive product -> 422 INACTIVE_PRODUCT
    const inactiveRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          productId: inactiveProductId,
          type: "in",
          quantity: "1",
          reason: "Inactive check",
        }),
      }),
    );
    expect(inactiveRes.status).toBe(422);
    expect(((await inactiveRes.json()) as { error: { code: string } }).error.code).toBe(
      "INACTIVE_PRODUCT",
    );
  });

  test("row locking prevents negative stock during concurrent Stock Out requests", async () => {
    const [resA, resB] = await Promise.all([
      app.handle(
        new Request("http://localhost/api/v1/stock-movements", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({
            productId: raceProductId,
            type: "out",
            quantity: "7",
            reason: "Concurrent out 7",
          }),
        }),
      ),
      app.handle(
        new Request("http://localhost/api/v1/stock-movements", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: staffCookie },
          body: JSON.stringify({
            productId: raceProductId,
            type: "out",
            quantity: "6",
            reason: "Concurrent out 6",
          }),
        }),
      ),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 422]);

    const winner = resA.status === 201 ? resA : resB;
    const loser = resA.status === 422 ? resA : resB;

    const winnerBody = (await winner.json()) as {
      data: { id: string; quantity: string; stockBefore: string; stockAfter: string };
    };
    createdMovementIds.push(winnerBody.data.id);

    const loserBody = (await loser.json()) as { error: { code: string } };
    expect(loserBody.error.code).toBe("INSUFFICIENT_STOCK");

    const expectedAfter = winnerBody.data.quantity === "7.000" ? "3.000" : "4.000";
    expect(winnerBody.data.stockBefore).toBe("10.000");
    expect(winnerBody.data.stockAfter).toBe(expectedAfter);

    const dbProduct = await db
      .select({ currentStock: products.currentStock })
      .from(products)
      .where(eq(products.id, raceProductId));
    expect(dbProduct[0]?.currentStock).toBe(expectedAfter);

    const recordedMovements = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.productId, raceProductId));
    expect(recordedMovements.length).toBe(1);
  });

  test("filters movement history, keeps deactivated product history visible, and enforces immutability", async () => {
    // Deactivate pcsProductId directly via API to ensure history remains accessible for Staff
    const deactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${pcsProductId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ status: "inactive" }),
      }),
    );
    expect(deactivateRes.status).toBe(200);

    // Filter by productId + half-open [startDate, endDate) excluding staffOutCreatedAt
    const listFilteredRes = await app.handle(
      new Request(
        `http://localhost/api/v1/stock-movements?productId=${pcsProductId}&startDate=${encodeURIComponent(firstPcsCreatedAt)}&endDate=${encodeURIComponent(staffOutCreatedAt)}&sortOrder=asc`,
        { headers: { cookie: staffCookie } },
      ),
    );
    expect(listFilteredRes.status).toBe(200);
    const filteredBody = (await listFilteredRes.json()) as {
      data: Array<{
        id: string;
        product: { status: string };
        type: string;
      }>;
      meta: { totalItems: number };
    };
    expect(filteredBody.meta.totalItems).toBe(1);
    expect(filteredBody.data[0]?.id).toBe(firstPcsMovementId);
    expect(filteredBody.data[0]?.product.status).toBe("inactive");

    // Filter by createdBy + type
    const creatorFilterRes = await app.handle(
      new Request(
        `http://localhost/api/v1/stock-movements?createdBy=${staffId}&type=out`,
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(creatorFilterRes.status).toBe(200);
    const creatorBody = (await creatorFilterRes.json()) as {
      data: Array<{ createdBy: { id: string }; type: string }>;
    };
    expect(creatorBody.data.length).toBeGreaterThanOrEqual(1);
    expect(creatorBody.data.every((item) => item.createdBy.id === staffId && item.type === "out")).toBe(
      true,
    );

    // Invalid date query -> 400
    const badDateRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements?startDate=2026-10-01", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(badDateRes.status).toBe(400);

    // startDate > endDate -> 400
    const invertedRangeRes = await app.handle(
      new Request(
        "http://localhost/api/v1/stock-movements?startDate=2026-10-02T00:00:00Z&endDate=2026-10-01T00:00:00Z",
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(invertedRangeRes.status).toBe(400);

    // Detail endpoint shows inactive product history to Staff
    const detailRes = await app.handle(
      new Request(
        `http://localhost/api/v1/stock-movements/${firstPcsMovementId}`,
        { headers: { cookie: staffCookie } },
      ),
    );
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as {
      data: { id: string; product: { status: string } };
    };
    expect(detailBody.data.id).toBe(firstPcsMovementId);
    expect(detailBody.data.product.status).toBe("inactive");

    // 404 when missing
    const missingRes = await app.handle(
      new Request(
        `http://localhost/api/v1/stock-movements/${crypto.randomUUID()}`,
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(missingRes.status).toBe(404);

    // Immutability: PATCH / PUT / DELETE are not implemented
    for (const method of ["PATCH", "PUT", "DELETE"] as const) {
      const immutableRes = await app.handle(
        new Request(
          `http://localhost/api/v1/stock-movements/${firstPcsMovementId}`,
          {
            method,
            headers: { "content-type": "application/json", cookie: adminCookie },
            body: method === "DELETE" ? undefined : JSON.stringify({ reason: "Edit" }),
          },
        ),
      );
      expect(immutableRes.status).toBe(404);
    }
  });

  test("rejects unknown properties on stock-in/out payloads and invalid UUID/query params with 400 VALIDATION_ERROR", async () => {
    for (const movementType of ["in", "out"] as const) {
      const extraRes = await app.handle(
        new Request("http://localhost/api/v1/stock-movements", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: staffCookie,
          },
          body: JSON.stringify({
            productId: pcsProductId,
            type: movementType,
            quantity: "1",
            reason: "Strict payload check",
            extraField: "unexpected",
          }),
        }),
      );
      expect(extraRes.status).toBe(400);
      const extraBody = (await extraRes.json()) as { error: { code: string } };
      expect(extraBody.error.code).toBe("VALIDATION_ERROR");
    }

    const invalidUuidRes = await app.handle(
      new Request("http://localhost/api/v1/stock-movements/not-a-uuid", {
        headers: { cookie: staffCookie },
      }),
    );
    expect(invalidUuidRes.status).toBe(400);
    const invalidUuidBody = (await invalidUuidRes.json()) as {
      error: { code: string };
    };
    expect(invalidUuidBody.error.code).toBe("VALIDATION_ERROR");
  });
});
