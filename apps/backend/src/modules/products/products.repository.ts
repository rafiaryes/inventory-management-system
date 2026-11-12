import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { isUniqueViolation } from "../../common/db-errors";
import {
  parseDecimalString,
  parseMinimumStock,
  STOCK_MAX_INTEGER_DIGITS,
  STOCK_SCALE,
  validateStoredMinimumStockForUnit,
} from "../../common/decimal";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../common/errors";
import { escapeLikePattern } from "../../common/pagination";
import type { Database } from "../../db";
import {
  categories,
  products,
  stockMovements,
  type ProductRow,
  type ProductStatus,
} from "../../db/schema";
import type { ListProductsQuery, ProductSortField } from "./products.types";

const PRODUCT_SORT_COLUMNS = {
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  name: products.name,
  sku: products.sku,
  currentStock: products.currentStock,
  minimumStock: products.minimumStock,
  status: products.status,
  purchasePrice: products.purchasePrice,
  sellingPrice: products.sellingPrice,
} as const satisfies Record<ProductSortField, unknown>;

export interface ProductWithCategory {
  product: ProductRow;
  categoryName: string;
}

export interface CreateProductPersistenceInput {
  categoryId: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  purchasePrice: string;
  sellingPrice: string;
  minimumStock: string;
}

export interface UpdateProductPersistenceInput {
  categoryId?: string;
  sku?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  minimumStock?: string;
}

export interface ProductsRepository {
  findMany(
    query: ListProductsQuery,
  ): Promise<{ items: ProductWithCategory[]; totalItems: number }>;
  findById(id: string): Promise<ProductWithCategory | null>;
  createInTx(input: CreateProductPersistenceInput): Promise<ProductWithCategory>;
  updateInTx(
    id: string,
    changes: UpdateProductPersistenceInput,
  ): Promise<ProductWithCategory>;
  updateStatusInTx(
    id: string,
    status: ProductStatus,
  ): Promise<ProductWithCategory>;
}

/**
 * Creates the database persistence repository for products and transactional consistency rules.
 */
export function createProductsRepository(db: Database): ProductsRepository {
  return {
    async findMany(
      query: ListProductsQuery,
    ): Promise<{ items: ProductWithCategory[]; totalItems: number }> {
      const conditions: SQL[] = [];

      if (query.search) {
        const pattern = `%${escapeLikePattern(query.search)}%`;
        const searchCond = or(
          ilike(products.name, pattern),
          ilike(products.sku, pattern),
        );
        if (searchCond) {
          conditions.push(searchCond);
        }
      }

      if (query.categoryId !== undefined) {
        conditions.push(eq(products.categoryId, query.categoryId));
      }

      if (query.status !== "all") {
        conditions.push(eq(products.status, query.status));
      }

      if (query.lowStock === true) {
        conditions.push(lte(products.currentStock, products.minimumStock));
      } else if (query.lowStock === false) {
        conditions.push(gt(products.currentStock, products.minimumStock));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const sortColumn = PRODUCT_SORT_COLUMNS[query.sortBy];
      const orderFn = query.sortOrder === "asc" ? asc : desc;
      const offset = (query.page - 1) * query.pageSize;

      const [countRows, rows] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(whereClause),
        db
          .select({
            product: products,
            categoryName: categories.name,
          })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(whereClause)
          .orderBy(orderFn(sortColumn), orderFn(products.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      return {
        items: rows,
        totalItems: countRows[0]?.count ?? 0,
      };
    },

    async findById(id: string): Promise<ProductWithCategory | null> {
      const rows = await db
        .select({
          product: products,
          categoryName: categories.name,
        })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .where(eq(products.id, id))
        .limit(1);

      return rows[0] ?? null;
    },

    async createInTx(
      input: CreateProductPersistenceInput,
    ): Promise<ProductWithCategory> {
      return db.transaction(async (tx) => {
        const categoryRows = await tx
          .select({
            id: categories.id,
            name: categories.name,
            isActive: categories.isActive,
          })
          .from(categories)
          .where(eq(categories.id, input.categoryId))
          .for("share");

        const category = categoryRows[0];
        if (!category) {
          throw new NotFoundError("Kategori tidak ditemukan");
        }

        if (!category.isActive) {
          throw new BusinessRuleError(
            "Kategori nonaktif tidak dapat digunakan untuk produk baru",
            "INACTIVE_CATEGORY",
          );
        }

        try {
          const inserted = await tx
            .insert(products)
            .values({
              categoryId: input.categoryId,
              sku: input.sku,
              name: input.name,
              description: input.description,
              unit: input.unit,
              purchasePrice: input.purchasePrice,
              sellingPrice: input.sellingPrice,
              currentStock: "0.000",
              minimumStock: input.minimumStock,
              status: "active",
            })
            .returning();

          const created = inserted[0];
          if (!created) {
            throw new Error("Failed to insert product record");
          }

          return {
            product: created,
            categoryName: category.name,
          };
        } catch (error) {
          if (isUniqueViolation(error, "products_sku_unique")) {
            throw new ConflictError("SKU sudah digunakan", "DUPLICATE_SKU");
          }
          throw error;
        }
      });
    },

    async updateInTx(
      id: string,
      changes: UpdateProductPersistenceInput,
    ): Promise<ProductWithCategory> {
      return db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, id))
          .for("update");

        const existing = existingRows[0];
        if (!existing) {
          throw new NotFoundError("Produk tidak ditemukan");
        }

        let targetCategoryId = existing.categoryId;
        let targetCategoryName: string;

        if (
          changes.categoryId !== undefined &&
          changes.categoryId !== existing.categoryId
        ) {
          const categoryRows = await tx
            .select({
              id: categories.id,
              name: categories.name,
              isActive: categories.isActive,
            })
            .from(categories)
            .where(eq(categories.id, changes.categoryId))
            .for("share");

          const targetCategory = categoryRows[0];
          if (!targetCategory) {
            throw new NotFoundError("Kategori tidak ditemukan");
          }
          if (!targetCategory.isActive) {
            throw new BusinessRuleError(
              "Kategori nonaktif tidak dapat dipilih untuk produk",
              "INACTIVE_CATEGORY",
            );
          }

          targetCategoryId = targetCategory.id;
          targetCategoryName = targetCategory.name;
        } else {
          const currentCategoryRows = await tx
            .select({ name: categories.name })
            .from(categories)
            .where(eq(categories.id, existing.categoryId))
            .limit(1);
          const currentCategory = currentCategoryRows[0];
          if (!currentCategory) {
            throw new NotFoundError("Kategori produk tidak ditemukan");
          }
          targetCategoryName = currentCategory.name;
        }

        const nextUnit = changes.unit ?? existing.unit;
        if (nextUnit !== existing.unit) {
          const parsedCurrentStock = parseDecimalString(
            existing.currentStock,
            STOCK_SCALE,
            STOCK_MAX_INTEGER_DIGITS,
            "currentStock",
          );

          if (!parsedCurrentStock.isZero) {
            throw new BusinessRuleError(
              "Satuan produk tidak dapat diubah selama stok produk tidak nol",
              "BUSINESS_RULE_VIOLATION",
            );
          }

          const existingMovements = await tx
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.productId, id))
            .limit(1);

          if (existingMovements.length > 0) {
            throw new BusinessRuleError(
              "Satuan produk tidak dapat diubah karena sudah memiliki riwayat pergerakan stok",
              "BUSINESS_RULE_VIOLATION",
            );
          }
        }

        let nextMinimumStock = existing.minimumStock;
        if (changes.minimumStock !== undefined) {
          nextMinimumStock = parseMinimumStock(
            changes.minimumStock,
            nextUnit,
            "minimumStock",
          );
        } else if (nextUnit !== existing.unit) {
          validateStoredMinimumStockForUnit(existing.minimumStock, nextUnit);
        }

        try {
          const updatedRows = await tx
            .update(products)
            .set({
              categoryId: targetCategoryId,
              sku: changes.sku ?? existing.sku,
              name: changes.name ?? existing.name,
              description:
                changes.description !== undefined
                  ? changes.description
                  : existing.description,
              unit: nextUnit,
              purchasePrice: changes.purchasePrice ?? existing.purchasePrice,
              sellingPrice: changes.sellingPrice ?? existing.sellingPrice,
              minimumStock: nextMinimumStock,
              updatedAt: new Date(),
            })
            .where(eq(products.id, id))
            .returning();

          const updated = updatedRows[0];
          if (!updated) {
            throw new NotFoundError("Produk tidak ditemukan");
          }

          return {
            product: updated,
            categoryName: targetCategoryName,
          };
        } catch (error) {
          if (isUniqueViolation(error, "products_sku_unique")) {
            throw new ConflictError("SKU sudah digunakan", "DUPLICATE_SKU");
          }
          throw error;
        }
      });
    },

    async updateStatusInTx(
      id: string,
      status: ProductStatus,
    ): Promise<ProductWithCategory> {
      return db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, id))
          .for("update");

        const existing = existingRows[0];
        if (!existing) {
          throw new NotFoundError("Produk tidak ditemukan");
        }

        const categoryRows = await tx
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, existing.categoryId))
          .limit(1);

        const categoryName = categoryRows[0]?.name ?? "";

        if (existing.status === status) {
          return {
            product: existing,
            categoryName,
          };
        }

        const updatedRows = await tx
          .update(products)
          .set({
            status,
            updatedAt: new Date(),
          })
          .where(eq(products.id, id))
          .returning();

        const updated = updatedRows[0];
        if (!updated) {
          throw new NotFoundError("Produk tidak ditemukan");
        }

        return {
          product: updated,
          categoryName,
        };
      });
    },
  };
}
