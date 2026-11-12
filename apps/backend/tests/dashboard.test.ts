import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
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

describe("dashboard API endpoint", () => {
  // Fixed instant in October 2026 Asia/Jakarta:
  // Calendar month range = [2026-09-30T17:00:00.000Z, 2026-10-31T17:00:00.000Z)
  const app = createApp({
    env: createTestEnv(),
    now: () => new Date("2026-10-15T10:00:00.000Z"),
  });

  const runId = crypto.randomUUID().slice(0, 8);
  const upperRunId = runId.toUpperCase();
  const password = "DashTestPassword#2026";
  const adminEmail = `dash-admin-${runId}@example.com`;
  const staffEmail = `dash-staff-${runId}@example.com`;

  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdMovementIds: string[] = [];

  let adminId = "";
  let adminCookie = "";
  let staffCookie = "";
  let topLowStockId = "";
  let tieSmallerStockId = "";
  let newestMovementId = "";

  async function seedUser(email: string, role: UserRole): Promise<string> {
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });
    const rows = await db
      .insert(users)
      .values({
        name: `Dash ${role} ${runId}`,
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
    await seedUser(staffEmail, "staff");
    adminCookie = await login(adminEmail);
    staffCookie = await login(staffEmail);

    // 2 active categories, 1 inactive category
    const catRows = await db
      .insert(categories)
      .values([
        { name: `Dash Cat A ${runId}`, isActive: true },
        { name: `Dash Cat B ${runId}`, isActive: true },
        { name: `Dash Cat Inactive ${runId}`, isActive: false },
      ])
      .returning({ id: categories.id, isActive: categories.isActive });

    for (const row of catRows) {
      createdCategoryIds.push(row.id);
    }
    const activeCatId = catRows[0]!.id;

    // Seed 13 active products:
    // - 11 low-stock (current <= minimum) to verify max 10 cap and ordering
    // - 2 normal stock (current > minimum)
    // Plus 1 inactive product (with low stock, must be excluded from activeProductCount & lowStockCount)
    const productRowsInput = [
      // Highest deficit (25.000 - 2.000 = 23.000)
      {
        categoryId: activeCatId,
        sku: `DSH-TOP-${upperRunId}`,
        name: "Top Deficit",
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "2.000",
        minimumStock: "25.000",
        status: "active" as const,
      },
      // Equal deficit of 10.000: smaller currentStock (1 vs 5) should come first
      {
        categoryId: activeCatId,
        sku: `DSH-TIE1-${upperRunId}`,
        name: "Tie Smaller Stock",
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "1.000",
        minimumStock: "11.000",
        status: "active" as const,
      },
      {
        categoryId: activeCatId,
        sku: `DSH-TIE2-${upperRunId}`,
        name: "Tie Larger Stock",
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "5.000",
        minimumStock: "15.000",
        status: "active" as const,
      },
      // 8 more low-stock products (deficits 5..1, including equality currentStock === minimumStock)
      ...Array.from({ length: 8 }, (_, idx) => ({
        categoryId: activeCatId,
        sku: `DSH-LOW${idx}-${upperRunId}`,
        name: `Low Stock ${idx}`,
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "3.000",
        minimumStock: idx === 7 ? "3.000" : `${3 + (7 - idx)}.000`,
        status: "active" as const,
      })),
      // 2 healthy active products
      {
        categoryId: activeCatId,
        sku: `DSH-OK1-${upperRunId}`,
        name: "Healthy 1",
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "20.000",
        minimumStock: "5.000",
        status: "active" as const,
      },
      {
        categoryId: activeCatId,
        sku: `DSH-OK2-${upperRunId}`,
        name: "Healthy 2",
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "10.000",
        minimumStock: "5.000",
        status: "active" as const,
      },
      // Inactive product with low stock (excluded from product/low-stock metrics,
      // but its movements must still count in monthly summary & recent movements)
      {
        categoryId: activeCatId,
        sku: `DSH-INACT-${upperRunId}`,
        name: "Inactive Product",
        unit: "pcs",
        purchasePrice: "1000.00",
        sellingPrice: "2000.00",
        currentStock: "0.000",
        minimumStock: "10.000",
        status: "inactive" as const,
      },
    ];

    const insertedProducts = await db
      .insert(products)
      .values(productRowsInput)
      .returning({ id: products.id, sku: products.sku });

    let healthyProductId = "";
    let inactiveProductId = "";
    for (const row of insertedProducts) {
      createdProductIds.push(row.id);
      if (row.sku === `DSH-TOP-${upperRunId}`) topLowStockId = row.id;
      if (row.sku === `DSH-TIE1-${upperRunId}`) tieSmallerStockId = row.id;
      if (row.sku === `DSH-OK1-${upperRunId}`) healthyProductId = row.id;
      if (row.sku === `DSH-INACT-${upperRunId}`) inactiveProductId = row.id;
    }

    // Seed 12 movements across timezone boundaries:
    // - 1 strictly before Oct 2026 WIB (`2026-09-30T16:59:59.999Z`) -> excluded from monthly count
    // - 1 at exact start bound (`2026-09-30T17:00:00.000Z`) -> included (IN)
    // - 8 inside Oct 2026 WIB on active product (5 IN, 3 OUT) -> included
    // - 1 inside Oct 2026 WIB on INACTIVE product (`2026-10-31T16:59:59.999Z`, OUT) -> included
    // - 1 at exact end bound (`2026-10-31T17:00:00.000Z`, Nov 1 00:00 WIB) -> excluded from Oct monthly count, newest in recentStockMovements
    const movementValues = [
      {
        productId: healthyProductId,
        type: "in" as const,
        quantity: "5.000",
        stockBefore: "0.000",
        stockAfter: "5.000",
        reason: "Before month boundary",
        notes: "Hidden notes check",
        createdBy: adminId,
        createdAt: new Date("2026-09-30T16:59:59.999Z"),
      },
      {
        productId: healthyProductId,
        type: "in" as const,
        quantity: "2.000",
        stockBefore: "5.000",
        stockAfter: "7.000",
        reason: "Exact month start",
        notes: null,
        createdBy: adminId,
        createdAt: new Date("2026-09-30T17:00:00.000Z"),
      },
      ...Array.from({ length: 5 }, (_, idx) => ({
        productId: healthyProductId,
        type: "in" as const,
        quantity: "1.000",
        stockBefore: `${7 + idx}.000`,
        stockAfter: `${8 + idx}.000`,
        reason: `Mid-month IN ${idx}`,
        notes: null,
        createdBy: adminId,
        createdAt: new Date(`2026-10-10T0${idx}:00:00.000Z`),
      })),
      ...Array.from({ length: 3 }, (_, idx) => ({
        productId: healthyProductId,
        type: "out" as const,
        quantity: "1.000",
        stockBefore: `${12 - idx}.000`,
        stockAfter: `${11 - idx}.000`,
        reason: `Mid-month OUT ${idx}`,
        notes: null,
        createdBy: adminId,
        createdAt: new Date(`2026-10-12T0${idx}:00:00.000Z`),
      })),
      {
        productId: inactiveProductId,
        type: "out" as const,
        quantity: "1.000",
        stockBefore: "1.000",
        stockAfter: "0.000",
        reason: "Last instant Oct WIB on inactive product",
        notes: "Must not leak notes",
        createdBy: adminId,
        createdAt: new Date("2026-10-31T16:59:59.999Z"),
      },
      {
        productId: healthyProductId,
        type: "in" as const,
        quantity: "11.000",
        stockBefore: "9.000",
        stockAfter: "20.000",
        reason: "Exact Nov 1 WIB (outside Oct count)",
        notes: "Top recent movement",
        createdBy: adminId,
        createdAt: new Date("2026-10-31T17:00:00.000Z"),
      },
    ];

    const insertedMovements = await db
      .insert(stockMovements)
      .values(movementValues)
      .returning({ id: stockMovements.id, reason: stockMovements.reason });

    for (const row of insertedMovements) {
      createdMovementIds.push(row.id);
      if (row.reason === "Exact Nov 1 WIB (outside Oct count)") {
        newestMovementId = row.id;
      }
    }
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

  test("unauthenticated dashboard request returns 401", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/dashboard"));
    expect(res.status).toBe(401);
  });

  test("returns identical price-free metrics, low-stock ordering, timezone month counts, and recent movements for Admin and Staff", async () => {
    const [adminRes, staffRes] = await Promise.all([
      app.handle(
        new Request("http://localhost/api/v1/dashboard", {
          headers: { cookie: adminCookie },
        }),
      ),
      app.handle(
        new Request("http://localhost/api/v1/dashboard", {
          headers: { cookie: staffCookie },
        }),
      ),
    ]);

    expect(adminRes.status).toBe(200);
    expect(staffRes.status).toBe(200);

    const adminPayload = (await adminRes.json()) as {
      success: boolean;
      data: {
        summary: {
          activeProductCount: number;
          activeCategoryCount: number;
          lowStockCount: number;
          stockInCount: number;
          stockOutCount: number;
        };
        lowStockProducts: Array<Record<string, unknown>>;
        recentStockMovements: Array<Record<string, unknown>>;
      };
    };
    const staffPayload = (await staffRes.json()) as typeof adminPayload;

    expect(adminPayload.data).toEqual(staffPayload.data);

    // 13 active products (inactive excluded), 2 active categories, 11 low-stock active products,
    // Monthly counts in Oct 2026 Asia/Jakarta: 1 + 5 = 6 IN, 3 + 1 (inactive product) = 4 OUT
    expect(adminPayload.data.summary).toEqual({
      activeProductCount: 13,
      activeCategoryCount: 2,
      lowStockCount: 11,
      stockInCount: 6,
      stockOutCount: 4,
    });

    // Low stock capped at 10, sorted by (minimumStock - currentStock) DESC, currentStock ASC, id ASC
    expect(adminPayload.data.lowStockProducts).toHaveLength(10);
    expect(adminPayload.data.lowStockProducts[0]?.id).toBe(topLowStockId);
    expect(adminPayload.data.lowStockProducts[1]?.id).toBe(tieSmallerStockId);

    // Recent movements capped at 10, ordered DESC, includes inactive product movement, no notes/prices
    expect(adminPayload.data.recentStockMovements).toHaveLength(10);
    expect(adminPayload.data.recentStockMovements[0]?.id).toBe(newestMovementId);
    expect(
      adminPayload.data.recentStockMovements.some(
        (item) =>
          (item.product as { sku?: string }).sku === `DSH-INACT-${upperRunId}`,
      ),
    ).toBe(true);

    for (const prod of adminPayload.data.lowStockProducts) {
      expect("purchasePrice" in prod).toBe(false);
      expect("sellingPrice" in prod).toBe(false);
    }
    for (const mov of adminPayload.data.recentStockMovements) {
      expect("notes" in mov).toBe(false);
      expect("purchasePrice" in mov).toBe(false);
      expect("sellingPrice" in mov).toBe(false);
      expect("status" in (mov.product as object)).toBe(false);
    }
  });
});
