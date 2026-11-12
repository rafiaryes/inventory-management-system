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

describe("products API endpoints", () => {
  const app = createApp({ env: createTestEnv() });
  const runId = crypto.randomUUID().slice(0, 8);
  const upperRunId = runId.toUpperCase();
  const password = "ProductTestPassword#2026";
  const adminEmail = `prod-admin-${runId}@example.com`;
  const staffEmail = `prod-staff-${runId}@example.com`;

  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];

  let adminId = "";
  let adminCookie = "";
  let staffCookie = "";
  let activeCategoryId = "";
  let inactiveCategoryId = "";

  async function seedUser(email: string, role: UserRole): Promise<string> {
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });
    const rows = await db
      .insert(users)
      .values({
        name: `Product ${role} ${runId}`,
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
    adminId = await seedUser(adminEmail, "admin");
    await seedUser(staffEmail, "staff");
    adminCookie = await loginAs(adminEmail);
    staffCookie = await loginAs(staffEmail);

    const [activeCat] = await db
      .insert(categories)
      .values({
        name: `Cat Active ${runId}`,
        description: null,
        isActive: true,
      })
      .returning();
    const [inactiveCat] = await db
      .insert(categories)
      .values({
        name: `Cat Inactive ${runId}`,
        description: null,
        isActive: false,
      })
      .returning();

    activeCategoryId = activeCat!.id;
    inactiveCategoryId = inactiveCat!.id;
    createdCategoryIds.push(activeCategoryId, inactiveCategoryId);
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await db
        .delete(stockMovements)
        .where(inArray(stockMovements.productId, createdProductIds));
      await db
        .delete(products)
        .where(inArray(products.id, createdProductIds));
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

  test("validates product creation rules: SKU/unit normalization, category check, prices, and unit precision", async () => {
    // Staff forbidden from creating product
    const staffRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: staffCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `STAFF-${upperRunId}`,
          name: "Blocked",
          unit: "pcs",
          purchasePrice: "1000.00",
          sellingPrice: "1500.00",
        }),
      }),
    );
    expect(staffRes.status).toBe(403);

    // Inactive category rejected with 422 INACTIVE_CATEGORY
    const inactiveCatRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: inactiveCategoryId,
          sku: `INACTCAT-${upperRunId}`,
          name: "Inactive Cat Product",
          unit: "pcs",
          purchasePrice: "1000.00",
          sellingPrice: "1500.00",
        }),
      }),
    );
    expect(inactiveCatRes.status).toBe(422);
    const inactiveCatBody = (await inactiveCatRes.json()) as {
      error: { code: string };
    };
    expect(inactiveCatBody.error.code).toBe("INACTIVE_CATEGORY");

    // Fractional minimumStock on count-only unit ("pcs") rejected with 422 INVALID_UNIT_QUANTITY
    const fractionalCountOnlyRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `FRAC-${upperRunId}`,
          name: "Fractional Count Item",
          unit: " PCS ",
          purchasePrice: "1000.00",
          sellingPrice: "1500.00",
          minimumStock: "2.500",
        }),
      }),
    );
    expect(fractionalCountOnlyRes.status).toBe(422);
    const fracBody = (await fractionalCountOnlyRes.json()) as {
      error: { code: string };
    };
    expect(fracBody.error.code).toBe("INVALID_UNIT_QUANTITY");

    // Negative price rejected with 422 BUSINESS_RULE_VIOLATION; >2 decimals rejected with 400 VALIDATION_ERROR
    const negativePriceRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `NEG-${upperRunId}`,
          name: "Negative Price Item",
          unit: "pcs",
          purchasePrice: "-10.00",
          sellingPrice: "1500.00",
        }),
      }),
    );
    expect(negativePriceRes.status).toBe(422);

    const excessPrecisionRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `PREC-${upperRunId}`,
          name: "Excess Precision",
          unit: "pcs",
          purchasePrice: "10.123",
          sellingPrice: "15.00",
        }),
      }),
    );
    expect(excessPrecisionRes.status).toBe(400);

    // Valid fractional minimumStock on non-count-only unit ("kg") + normalization
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `  kg-${runId}-1  `,
          name: `  Gula Pasir ${runId}  `,
          description: "   ",
          unit: "  KG ",
          purchasePrice: "12000",
          sellingPrice: "15000.5",
          minimumStock: "2.5",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as {
      data: {
        id: string;
        sku: string;
        name: string;
        description: string | null;
        unit: string;
        purchasePrice: string;
        sellingPrice: string;
        currentStock: string;
        minimumStock: string;
        status: string;
        category: { id: string; name: string };
      };
    };
    createdProductIds.push(createdBody.data.id);
    expect(createdBody.data.sku).toBe(`KG-${upperRunId}-1`);
    expect(createdBody.data.name).toBe(`Gula Pasir ${runId}`);
    expect(createdBody.data.description).toBeNull();
    expect(createdBody.data.unit).toBe("kg");
    expect(createdBody.data.purchasePrice).toBe("12000.00");
    expect(createdBody.data.sellingPrice).toBe("15000.50");
    expect(createdBody.data.currentStock).toBe("0.000");
    expect(createdBody.data.minimumStock).toBe("2.500");
    expect(createdBody.data.status).toBe("active");
    expect(createdBody.data.category.id).toBe(activeCategoryId);

    // Duplicate normalized SKU rejected with 409 DUPLICATE_SKU
    const dupSkuRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `kg-${runId}-1`,
          name: "Another Name",
          unit: "kg",
          purchasePrice: "100.00",
          sellingPrice: "200.00",
        }),
      }),
    );
    expect(dupSkuRes.status).toBe(409);
    const dupBody = (await dupSkuRes.json()) as { error: { code: string } };
    expect(dupBody.error.code).toBe("DUPLICATE_SKU");
  });

  test("enforces role-based price visibility, Staff query/status/sort guards, and inactive category resilience", async () => {
    // Create an extra category that we will deactivate AFTER linking a product
    const tempCatRes = await app.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ name: `Cat To Deactivate ${runId}` }),
      }),
    );
    const tempCat = ((await tempCatRes.json()) as { data: { id: string } }).data;
    createdCategoryIds.push(tempCat.id);

    const pActiveRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: tempCat.id,
          sku: `VIS-${upperRunId}-A`,
          name: `Active Linked ${runId}`,
          unit: "pcs",
          purchasePrice: "50000.00",
          sellingPrice: "75000.00",
          minimumStock: "5",
        }),
      }),
    );
    const activeProductId = (
      (await pActiveRes.json()) as { data: { id: string } }
    ).data.id;
    createdProductIds.push(activeProductId);

    // Deactivate linked category; active product MUST still be readable by Staff & Admin
    await app.handle(
      new Request(`http://localhost/api/v1/categories/${tempCat.id}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );

    // Admin sees prices in list and detail
    const adminListRes = await app.handle(
      new Request(
        `http://localhost/api/v1/products?categoryId=${tempCat.id}&lowStock=true&sortBy=purchasePrice&sortOrder=desc`,
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(adminListRes.status).toBe(200);
    const adminListBody = (await adminListRes.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(adminListBody.data.length).toBe(1);
    expect(adminListBody.data[0]!.purchasePrice).toBe("50000.00");
    expect(adminListBody.data[0]!.sellingPrice).toBe("75000.00");

    // Staff sees product WITHOUT purchasePrice or sellingPrice keys on list and detail
    const staffListRes = await app.handle(
      new Request(
        `http://localhost/api/v1/products?categoryId=${tempCat.id}&lowStock=true`,
        { headers: { cookie: staffCookie } },
      ),
    );
    expect(staffListRes.status).toBe(200);
    const staffListBody = (await staffListRes.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(staffListBody.data.length).toBe(1);
    expect("purchasePrice" in staffListBody.data[0]!).toBe(false);
    expect("sellingPrice" in staffListBody.data[0]!).toBe(false);

    const staffDetailRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${activeProductId}`, {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffDetailRes.status).toBe(200);
    const staffDetailBody = (await staffDetailRes.json()) as {
      data: Record<string, unknown>;
    };
    expect("purchasePrice" in staffDetailBody.data).toBe(false);
    expect("sellingPrice" in staffDetailBody.data).toBe(false);

    // Staff rejected with 403 on forbidden status and forbidden sortBy fields
    for (const forbiddenQuery of [
      "status=inactive",
      "status=all",
      "sortBy=purchasePrice",
      "sortBy=sellingPrice",
      "sortBy=status",
    ]) {
      const forbiddenRes = await app.handle(
        new Request(`http://localhost/api/v1/products?${forbiddenQuery}`, {
          headers: { cookie: staffCookie },
        }),
      );
      expect(forbiddenRes.status).toBe(403);
    }

    // Invalid sortBy returns 400 VALIDATION_ERROR even for Staff
    const invalidSortRes = await app.handle(
      new Request("http://localhost/api/v1/products?sortBy=id", {
        headers: { cookie: staffCookie },
      }),
    );
    expect(invalidSortRes.status).toBe(400);

    // Admin deactivates product -> idempotent repeat preserves updatedAt, Staff gets 403 on detail
    const deactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${activeProductId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ status: "inactive" }),
      }),
    );
    expect(deactivateRes.status).toBe(200);
    const deactBody = (await deactivateRes.json()) as {
      data: { status: string; updatedAt: string };
    };
    expect(deactBody.data.status).toBe("inactive");

    const repeatDeactRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${activeProductId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ status: "inactive" }),
      }),
    );
    expect(repeatDeactRes.status).toBe(200);
    const repeatBody = (await repeatDeactRes.json()) as {
      data: { updatedAt: string };
    };
    expect(repeatBody.data.updatedAt).toBe(deactBody.data.updatedAt);

    const staffInactiveDetailRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${activeProductId}`, {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffInactiveDetailRes.status).toBe(403);

    // Admin can still view inactive product via status=inactive and detail
    const adminInactiveDetailRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${activeProductId}`, {
        headers: { cookie: adminCookie },
      }),
    );
    expect(adminInactiveDetailRes.status).toBe(200);
  });

  test("enforces product update rules: empty body, currentStock rejection, category rules, and transactional unit change guards", async () => {
    // Create product with unit "kg" and fractional minimumStock "2.500"
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          categoryId: activeCategoryId,
          sku: `UPD-${upperRunId}-1`,
          name: `Updatable Item ${runId}`,
          unit: "kg",
          purchasePrice: "10000.00",
          sellingPrice: "12000.00",
          minimumStock: "2.500",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const productId = ((await createRes.json()) as { data: { id: string } }).data
      .id;
    createdProductIds.push(productId);

    // Empty PATCH rejected with 400
    const emptyPatch = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(emptyPatch.status).toBe(400);

    // Reject attempts to overwrite currentStock via PATCH
    const stockTamperPatch = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ currentStock: "99.000" }),
      }),
    );
    expect(stockTamperPatch.status).toBe(400);

    // Reject changing categoryId to inactive category (422 INACTIVE_CATEGORY)
    const inactiveCatPatch = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ categoryId: inactiveCategoryId }),
      }),
    );
    expect(inactiveCatPatch.status).toBe(422);

    // Reject changing unit "kg" -> "pcs" while stored minimumStock is "2.500"
    const unitMismatchMinStock = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ unit: "pcs" }),
      }),
    );
    expect(unitMismatchMinStock.status).toBe(422);
    const unitErrBody = (await unitMismatchMinStock.json()) as {
      error: { code: string };
    };
    expect(unitErrBody.error.code).toBe("INVALID_UNIT_QUANTITY");

    // Allow changing unit "kg" -> "pcs" when minimumStock is also updated to integer ("3.000") and zero stock/history
    const validUnitPatch = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          unit: "  PCS ",
          minimumStock: "3",
        }),
      }),
    );
    expect(validUnitPatch.status).toBe(200);
    const validUnitBody = (await validUnitPatch.json()) as {
      data: { unit: string; minimumStock: string };
    };
    expect(validUnitBody.data.unit).toBe("pcs");
    expect(validUnitBody.data.minimumStock).toBe("3.000");

    // When stock_movements history exists (even with current_stock = 0), unit change MUST fail with 422 BUSINESS_RULE_VIOLATION
    await db.insert(stockMovements).values({
      productId,
      type: "in",
      quantity: "5.000",
      stockBefore: "0.000",
      stockAfter: "5.000",
      reason: "Initial test inflow",
      notes: null,
      createdBy: adminId,
    });
    await db.insert(stockMovements).values({
      productId,
      type: "out",
      quantity: "5.000",
      stockBefore: "5.000",
      stockAfter: "0.000",
      reason: "Full outflow back to zero",
      notes: null,
      createdBy: adminId,
    });

    const unitWithHistoryRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ unit: "box" }),
      }),
    );
    expect(unitWithHistoryRes.status).toBe(422);
    const historyErrBody = (await unitWithHistoryRes.json()) as {
      error: { code: string };
    };
    expect(historyErrBody.error.code).toBe("BUSINESS_RULE_VIOLATION");

    // Clean currentStock still 0 check on non-zero product directly
    await db
      .update(products)
      .set({ currentStock: "5.000" })
      .where(eq(products.id, productId));
    const unitWithStockRes = await app.handle(
      new Request(`http://localhost/api/v1/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ unit: "box" }),
      }),
    );
    expect(unitWithStockRes.status).toBe(422);
  });
});
