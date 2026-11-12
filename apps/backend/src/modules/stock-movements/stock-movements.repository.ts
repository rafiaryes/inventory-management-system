import {
  and,
  asc,
  desc,
  eq,
  gte,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  formatScaledDecimal,
  MAX_STOCK_SCALED,
  parseDecimalString,
  parsePositiveStockQuantity,
  STOCK_MAX_INTEGER_DIGITS,
  STOCK_SCALE,
} from "../../common/decimal";
import { BusinessRuleError, NotFoundError } from "../../common/errors";
import type { Database } from "../../db";
import {
  products,
  stockMovements,
  users,
  type ProductStatus,
  type StockMovementRow,
  type StockMovementType,
} from "../../db/schema";
import type { ListStockMovementsQuery } from "./stock-movements.types";

export interface StockMovementRecord {
  movement: StockMovementRow;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    status: ProductStatus;
  };
  creator: {
    id: string;
    name: string;
  };
}

export interface CreateStockMovementPersistenceInput {
  productId: string;
  type: StockMovementType;
  quantityRaw: string;
  reason: string;
  notes: string | null;
  createdById: string;
}

export interface StockMovementsRepository {
  findMany(
    query: ListStockMovementsQuery,
  ): Promise<{ items: StockMovementRecord[]; totalItems: number }>;
  findById(id: string): Promise<StockMovementRecord | null>;
  createInTx(
    input: CreateStockMovementPersistenceInput,
  ): Promise<StockMovementRecord>;
}

function buildMovementFilters(query: ListStockMovementsQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.productId) {
    conditions.push(eq(stockMovements.productId, query.productId));
  }
  if (query.type) {
    conditions.push(eq(stockMovements.type, query.type));
  }
  if (query.createdBy) {
    conditions.push(eq(stockMovements.createdBy, query.createdBy));
  }
  if (query.startDate) {
    conditions.push(gte(stockMovements.createdAt, query.startDate));
  }
  if (query.endDate) {
    conditions.push(lt(stockMovements.createdAt, query.endDate));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Creates the database persistence repository for immutable stock movements and row-locked stock updates.
 */
export function createStockMovementsRepository(
  db: Database,
): StockMovementsRepository {
  return {
    async findMany(
      query: ListStockMovementsQuery,
    ): Promise<{ items: StockMovementRecord[]; totalItems: number }> {
      const whereClause = buildMovementFilters(query);
      const direction = query.sortOrder === "asc" ? asc : desc;
      const offset = (query.page - 1) * query.pageSize;

      const [countRows, rows] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(stockMovements)
          .where(whereClause),
        db
          .select({
            movement: stockMovements,
            product: {
              id: products.id,
              sku: products.sku,
              name: products.name,
              unit: products.unit,
              status: products.status,
            },
            creator: {
              id: users.id,
              name: users.name,
            },
          })
          .from(stockMovements)
          .innerJoin(products, eq(stockMovements.productId, products.id))
          .innerJoin(users, eq(stockMovements.createdBy, users.id))
          .where(whereClause)
          .orderBy(direction(stockMovements.createdAt), direction(stockMovements.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      return {
        items: rows,
        totalItems: countRows[0]?.count ?? 0,
      };
    },

    async findById(id: string): Promise<StockMovementRecord | null> {
      const rows = await db
        .select({
          movement: stockMovements,
          product: {
            id: products.id,
            sku: products.sku,
            name: products.name,
            unit: products.unit,
            status: products.status,
          },
          creator: {
            id: users.id,
            name: users.name,
          },
        })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productId, products.id))
        .innerJoin(users, eq(stockMovements.createdBy, users.id))
        .where(eq(stockMovements.id, id))
        .limit(1);

      return rows[0] ?? null;
    },

    async createInTx(
      input: CreateStockMovementPersistenceInput,
    ): Promise<StockMovementRecord> {
      return db.transaction(async (tx) => {
        const lockedProducts = await tx
          .select({
            id: products.id,
            sku: products.sku,
            name: products.name,
            unit: products.unit,
            status: products.status,
            currentStock: products.currentStock,
          })
          .from(products)
          .where(eq(products.id, input.productId))
          .for("update");

        const product = lockedProducts[0];
        if (!product) {
          throw new NotFoundError("Produk tidak ditemukan");
        }

        if (product.status !== "active") {
          throw new BusinessRuleError(
            "Produk nonaktif tidak dapat menerima pergerakan stok",
            "INACTIVE_PRODUCT",
          );
        }

        const quantityParsed = parsePositiveStockQuantity(
          input.quantityRaw,
          product.unit,
          "quantity",
        );

        const stockBeforeParsed = parseDecimalString(
          product.currentStock,
          STOCK_SCALE,
          STOCK_MAX_INTEGER_DIGITS,
          "currentStock",
        );

        let stockAfterScaled: bigint;
        if (input.type === "out") {
          if (stockBeforeParsed.scaled < quantityParsed.scaled) {
            throw new BusinessRuleError(
              "Stok tidak mencukupi untuk pengeluaran ini",
              "INSUFFICIENT_STOCK",
              [
                {
                  field: "quantity",
                  message: `Stok tersedia (${stockBeforeParsed.canonical}) tidak mencukupi untuk pengeluaran (${quantityParsed.canonical})`,
                },
              ],
            );
          }
          stockAfterScaled = stockBeforeParsed.scaled - quantityParsed.scaled;
        } else {
          stockAfterScaled = stockBeforeParsed.scaled + quantityParsed.scaled;
          if (stockAfterScaled > MAX_STOCK_SCALED) {
            throw new BusinessRuleError(
              "Stok hasil melebihi batas maksimum sistem (99999999999.999)",
              "BUSINESS_RULE_VIOLATION",
            );
          }
        }

        const stockAfter = formatScaledDecimal(stockAfterScaled, STOCK_SCALE);

        await tx
          .update(products)
          .set({
            currentStock: stockAfter,
            updatedAt: sql`NOW()`,
          })
          .where(eq(products.id, product.id));

        const insertedMovements = await tx
          .insert(stockMovements)
          .values({
            productId: product.id,
            type: input.type,
            quantity: quantityParsed.canonical,
            stockBefore: stockBeforeParsed.canonical,
            stockAfter,
            reason: input.reason,
            notes: input.notes,
            createdBy: input.createdById,
          })
          .returning();

        const movement = insertedMovements[0]!;
        const creatorRows = await tx
          .select({
            id: users.id,
            name: users.name,
          })
          .from(users)
          .where(eq(users.id, input.createdById))
          .limit(1);

        const creator = creatorRows[0];
        if (!creator) {
          throw new NotFoundError("Pengguna pembuat transaksi tidak ditemukan");
        }

        return {
          movement,
          product: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            status: product.status,
          },
          creator,
        };
      });
    },
  };
}
