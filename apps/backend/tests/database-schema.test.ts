import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  categories,
  products,
  sessions,
  stockMovements,
  users,
} from "../src/db/schema";
import { readSeedConfig, seedInitialData } from "../src/db/seed";

class RollbackTestError extends Error {
  constructor() {
    super("ROLLBACK_TEST_TX");
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withRollbackTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new RollbackTestError();
    });
  } catch (error) {
    if (error instanceof RollbackTestError) {
      return;
    }
    throw error;
  }
}

async function expectSavepointReject(
  tx: Tx,
  fn: () => Promise<unknown>,
  expectedPgCode?: string,
): Promise<void> {
  await tx.execute(sql`SAVEPOINT sp_test_constraint`);
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  } finally {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT sp_test_constraint`);
    await tx.execute(sql`RELEASE SAVEPOINT sp_test_constraint`);
  }

  expect(caught).toBeDefined();
  if (expectedPgCode && caught && typeof caught === "object") {
    const errObj = caught as { code?: unknown; cause?: { code?: unknown } };
    const pgCode = errObj.code ?? errObj.cause?.code;
    expect(pgCode).toBe(expectedPgCode);
  }
}

describe("database schema constraints, defaults, FKs, and transactions", () => {
  test("applies expected defaults for users, categories, and products", async () => {
    await withRollbackTx(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: "Test Admin",
          email: "test-defaults@example.com",
          passwordHash: "$argon2id$v=19$m=65536,t=2,p=1$dummy$hash",
          role: "admin",
        })
        .returning();

      expect(user).toBeDefined();
      expect(user?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(user?.isActive).toBe(true);
      expect(user?.createdAt).toBeInstanceOf(Date);
      expect(user?.updatedAt).toBeInstanceOf(Date);

      const [category] = await tx
        .insert(categories)
        .values({ name: "Test Category" })
        .returning();

      expect(category).toBeDefined();
      expect(category?.isActive).toBe(true);

      const [product] = await tx
        .insert(products)
        .values({
          categoryId: category!.id,
          sku: "TEST-001",
          name: "Test Product",
          unit: "pcs",
          purchasePrice: "10000.00",
          sellingPrice: "15000.00",
        })
        .returning();

      expect(product).toBeDefined();
      expect(product?.currentStock).toBe("0.000");
      expect(product?.minimumStock).toBe("0.000");
      expect(product?.status).toBe("active");
    });
  });

  test("enforces unique indexes and constraints (case-insensitive email & category, SKU, session token_hash)", async () => {
    await withRollbackTx(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: "Unique User",
          email: "unique.user@example.com",
          passwordHash: "$argon2id$hash",
          role: "staff",
        })
        .returning();

      await expectSavepointReject(
        tx,
        () =>
          tx.execute(
            sql`INSERT INTO users (name, email, password_hash, role) VALUES ('Dup', 'unique.user@example.com', 'hash', 'staff')`,
          ),
        "23505",
      );

      // Different case/whitespace violates canonical email CHECK (23514) or unique index (23505)
      await expectSavepointReject(tx, () =>
        tx.insert(users).values({
          name: "Dup Canonical",
          email: "  Unique.User@example.com ",
          passwordHash: "$argon2id$hash",
          role: "staff",
        }),
      );

      const [category] = await tx
        .insert(categories)
        .values({ name: "Elektronik Test" })
        .returning();

      await expectSavepointReject(
        tx,
        () => tx.insert(categories).values({ name: "elektronik test" }),
        "23505",
      );

      const tokenHash = "a".repeat(64);
      await tx.insert(sessions).values({
        userId: user!.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await expectSavepointReject(
        tx,
        () =>
          tx.insert(sessions).values({
            userId: user!.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 3600_000),
          }),
        "23505",
      );

      await tx.insert(products).values({
        categoryId: category!.id,
        sku: "UNQ-001",
        name: "Mouse",
        unit: "pcs",
        purchasePrice: "50.00",
        sellingPrice: "80.00",
      });

      await expectSavepointReject(
        tx,
        () =>
          tx.insert(products).values({
            categoryId: category!.id,
            sku: "UNQ-001",
            name: "Mouse Duplicate",
            unit: "pcs",
            purchasePrice: "50.00",
            sellingPrice: "80.00",
          }),
        "23505",
      );
    });
  });

  test("enforces CHECK constraints on users, sessions, categories, products, and stock_movements", async () => {
    await withRollbackTx(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: "Check User",
          email: "check@example.com",
          passwordHash: "$argon2id$hash",
          role: "admin",
        })
        .returning();

      await expectSavepointReject(tx, () =>
        tx.insert(users).values({
          name: "   ",
          email: "blankname@example.com",
          passwordHash: "$argon2id$hash",
          role: "staff",
        }),
      );

      await expectSavepointReject(tx, () =>
        tx.insert(users).values({
          name: "Bad Email",
          email: "UPPER@example.com",
          passwordHash: "$argon2id$hash",
          role: "staff",
        }),
      );

      await expectSavepointReject(tx, () =>
        tx.execute(
          sql`INSERT INTO users (name, email, password_hash, role) VALUES ('Bad Role', 'badrole@example.com', 'hash', 'superadmin')`,
        ),
      );

      await expectSavepointReject(tx, () =>
        tx.insert(sessions).values({
          userId: user!.id,
          tokenHash: "NOT_HEX_64",
          expiresAt: new Date(Date.now() + 3600_000),
        }),
      );

      await expectSavepointReject(tx, () =>
        tx.insert(categories).values({ name: "  Untrimmed  " }),
      );

      const [category] = await tx
        .insert(categories)
        .values({ name: "Checks Category" })
        .returning();

      // Invalid SKU lowercase / symbols
      await expectSavepointReject(tx, () =>
        tx.insert(products).values({
          categoryId: category!.id,
          sku: "bad_sku",
          name: "Bad SKU",
          unit: "pcs",
          purchasePrice: "10.00",
          sellingPrice: "20.00",
        }),
      );

      // Negative price
      await expectSavepointReject(tx, () =>
        tx.insert(products).values({
          categoryId: category!.id,
          sku: "NEG-PRICE-1",
          name: "Neg Price",
          unit: "pcs",
          purchasePrice: "-1.00",
          sellingPrice: "20.00",
        }),
      );

      // Non-canonical unit
      await expectSavepointReject(tx, () =>
        tx.insert(products).values({
          categoryId: category!.id,
          sku: "BAD-UNIT-1",
          name: "Bad Unit",
          unit: "PCS",
          purchasePrice: "10.00",
          sellingPrice: "20.00",
        }),
      );

      const [product] = await tx
        .insert(products)
        .values({
          categoryId: category!.id,
          sku: "CHK-001",
          name: "Valid Product",
          unit: "pcs",
          purchasePrice: "100.00",
          sellingPrice: "150.00",
          currentStock: "10.000",
        })
        .returning();

      // Non-positive movement quantity
      await expectSavepointReject(tx, () =>
        tx.insert(stockMovements).values({
          productId: product!.id,
          type: "in",
          quantity: "0.000",
          stockBefore: "10.000",
          stockAfter: "10.000",
          reason: "Zero invalid",
          createdBy: user!.id,
        }),
      );

      // Blank movement reason
      await expectSavepointReject(tx, () =>
        tx.insert(stockMovements).values({
          productId: product!.id,
          type: "in",
          quantity: "5.000",
          stockBefore: "10.000",
          stockAfter: "15.000",
          reason: "   ",
          createdBy: user!.id,
        }),
      );

      // Invalid stock arithmetic
      await expectSavepointReject(tx, () =>
        tx.insert(stockMovements).values({
          productId: product!.id,
          type: "in",
          quantity: "5.000",
          stockBefore: "10.000",
          stockAfter: "20.000",
          reason: "Wrong arithmetic",
          createdBy: user!.id,
        }),
      );

      // Valid stock out arithmetic succeeds
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          productId: product!.id,
          type: "out",
          quantity: "3.000",
          stockBefore: "10.000",
          stockAfter: "7.000",
          reason: "Penjualan",
          createdBy: user!.id,
        })
        .returning();

      expect(movement?.stockAfter).toBe("7.000");
    });
  });

  test("enforces ON DELETE RESTRICT across all foreign keys", async () => {
    await withRollbackTx(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: "FK User",
          email: "fk@example.com",
          passwordHash: "$argon2id$hash",
          role: "admin",
        })
        .returning();

      const [category] = await tx
        .insert(categories)
        .values({ name: "FK Category" })
        .returning();

      await tx.insert(sessions).values({
        userId: user!.id,
        tokenHash: "b".repeat(64),
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const [product] = await tx
        .insert(products)
        .values({
          categoryId: category!.id,
          sku: "FK-001",
          name: "FK Product",
          unit: "pcs",
          purchasePrice: "10.00",
          sellingPrice: "15.00",
        })
        .returning();

      await tx.insert(stockMovements).values({
        productId: product!.id,
        type: "in",
        quantity: "5.000",
        stockBefore: "0.000",
        stockAfter: "5.000",
        reason: "Stok awal",
        createdBy: user!.id,
      });

      // Cannot delete user referenced by sessions/stock_movements (SQLSTATE 23001 = restrict_violation)
      await expectSavepointReject(
        tx,
        () => tx.delete(users).where(eq(users.id, user!.id)),
        "23001",
      );

      // Cannot delete category referenced by products
      await expectSavepointReject(
        tx,
        () => tx.delete(categories).where(eq(categories.id, category!.id)),
        "23001",
      );

      // Cannot delete product referenced by stock_movements
      await expectSavepointReject(
        tx,
        () => tx.delete(products).where(eq(products.id, product!.id)),
        "23001",
      );

      // Remove sessions for user, verify stock_movements.created_by FK still restricts user delete
      await tx.delete(sessions).where(eq(sessions.userId, user!.id));
      await expectSavepointReject(
        tx,
        () => tx.delete(users).where(eq(users.id, user!.id)),
        "23001",
      );
    });
  });

  test("rolls back entire transaction when second operation fails", async () => {
    const markerSku = "ROLLBACK-TEST-001";
    const markerCategory = "Rollback Test Category";

    await expect(
      db.transaction(async (tx) => {
        const [category] = await tx
          .insert(categories)
          .values({ name: markerCategory })
          .returning();

        // Valid product insert followed by an intentionally invalid stock movement insert
        const [product] = await tx
          .insert(products)
          .values({
            categoryId: category!.id,
            sku: markerSku,
            name: "Should Rollback",
            unit: "pcs",
            purchasePrice: "10.00",
            sellingPrice: "15.00",
          })
          .returning();

        await tx.insert(stockMovements).values({
          productId: product!.id,
          type: "in",
          quantity: "1.000",
          stockBefore: "0.000",
          stockAfter: "1.000",
          reason: "Invalid creator UUID triggers FK failure",
          createdBy: "00000000-0000-0000-0000-000000000000",
        });
      }),
    ).rejects.toThrow();

    const remainingCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.name, markerCategory));
    const remainingProducts = await db
      .select()
      .from(products)
      .where(eq(products.sku, markerSku));

    expect(remainingCategories).toHaveLength(0);
    expect(remainingProducts).toHaveLength(0);
  });

  test("seedInitialData hashes password with Argon2id and is idempotent", async () => {
    const seedCfg = readSeedConfig({
      SEED_ADMIN_NAME: "Seed Admin",
      SEED_ADMIN_EMAIL: "  SEED-ADMIN@Example.com ",
      SEED_ADMIN_PASSWORD: "SeedPassword123!",
    });

    expect(seedCfg.adminEmail).toBe("seed-admin@example.com");

    await withRollbackTx(async (tx) => {
      const firstRun = await seedInitialData(tx, seedCfg);
      expect(firstRun.adminCreated).toBe(true);
      expect(firstRun.categoriesCreated).toBe(3);

      const secondRun = await seedInitialData(tx, seedCfg);
      expect(secondRun.adminCreated).toBe(false);
      expect(secondRun.categoriesCreated).toBe(0);

      const [seededAdmin] = await tx
        .select()
        .from(users)
        .where(eq(users.email, seedCfg.adminEmail));

      expect(seededAdmin).toBeDefined();
      expect(seededAdmin?.role).toBe("admin");
      expect(seededAdmin?.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(
        await Bun.password.verify(
          seedCfg.adminPassword,
          seededAdmin!.passwordHash,
        ),
      ).toBe(true);
    });
  });
});
