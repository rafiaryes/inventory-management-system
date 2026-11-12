import {
  and,
  asc,
  desc,
  eq,
  ilike,
  sql,
  type SQL,
} from "drizzle-orm";
import { isUniqueViolation } from "../../common/db-errors";
import { ConflictError, NotFoundError } from "../../common/errors";
import { escapeLikePattern } from "../../common/pagination";
import type { Database } from "../../db";
import { categories, type CategoryRow } from "../../db/schema";
import type {
  CategorySortField,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "./categories.types";

const CATEGORY_SORT_COLUMNS = {
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
  name: categories.name,
  isActive: categories.isActive,
} as const satisfies Record<CategorySortField, unknown>;

export interface CategoriesRepository {
  findMany(
    query: ListCategoriesQuery,
  ): Promise<{ items: CategoryRow[]; totalItems: number }>;
  findById(id: string): Promise<CategoryRow | null>;
  create(input: { name: string; description: string | null }): Promise<CategoryRow>;
  update(id: string, changes: UpdateCategoryInput): Promise<CategoryRow>;
  updateStatusInTx(id: string, isActive: boolean): Promise<CategoryRow>;
}

/**
 * Creates the database persistence repository for categories.
 */
export function createCategoriesRepository(db: Database): CategoriesRepository {
  return {
    async findMany(
      query: ListCategoriesQuery,
    ): Promise<{ items: CategoryRow[]; totalItems: number }> {
      const conditions: SQL[] = [];

      if (query.search) {
        const pattern = `%${escapeLikePattern(query.search)}%`;
        conditions.push(ilike(categories.name, pattern));
      }

      if (query.isActive !== undefined) {
        conditions.push(eq(categories.isActive, query.isActive));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const sortColumn = CATEGORY_SORT_COLUMNS[query.sortBy];
      const orderFn = query.sortOrder === "asc" ? asc : desc;
      const offset = (query.page - 1) * query.pageSize;

      const [countRows, items] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(categories)
          .where(whereClause),
        db
          .select()
          .from(categories)
          .where(whereClause)
          .orderBy(orderFn(sortColumn), orderFn(categories.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      return {
        items,
        totalItems: countRows[0]?.count ?? 0,
      };
    },

    async findById(id: string): Promise<CategoryRow | null> {
      const rows = await db
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async create(input): Promise<CategoryRow> {
      try {
        const rows = await db
          .insert(categories)
          .values({
            name: input.name,
            description: input.description,
            isActive: true,
          })
          .returning();

        const created = rows[0];
        if (!created) {
          throw new Error("Failed to insert category record");
        }
        return created;
      } catch (error) {
        if (isUniqueViolation(error, "categories_name_normalized_uidx")) {
          throw new ConflictError(
            "Nama kategori sudah digunakan",
            "DUPLICATE_CATEGORY_NAME",
          );
        }
        throw error;
      }
    },

    async update(id: string, changes: UpdateCategoryInput): Promise<CategoryRow> {
      return db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, id))
          .for("update");

        const existing = existingRows[0];
        if (!existing) {
          throw new NotFoundError("Kategori tidak ditemukan");
        }

        try {
          const updatedRows = await tx
            .update(categories)
            .set({
              name: changes.name ?? existing.name,
              description:
                changes.description !== undefined
                  ? changes.description
                  : existing.description,
              updatedAt: new Date(),
            })
            .where(eq(categories.id, id))
            .returning();

          const updated = updatedRows[0];
          if (!updated) {
            throw new NotFoundError("Kategori tidak ditemukan");
          }
          return updated;
        } catch (error) {
          if (isUniqueViolation(error, "categories_name_normalized_uidx")) {
            throw new ConflictError(
              "Nama kategori sudah digunakan",
              "DUPLICATE_CATEGORY_NAME",
            );
          }
          throw error;
        }
      });
    },

    async updateStatusInTx(id: string, isActive: boolean): Promise<CategoryRow> {
      return db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(categories)
          .where(eq(categories.id, id))
          .for("update");

        const existing = existingRows[0];
        if (!existing) {
          throw new NotFoundError("Kategori tidak ditemukan");
        }

        if (existing.isActive === isActive) {
          return existing;
        }

        const updatedRows = await tx
          .update(categories)
          .set({
            isActive,
            updatedAt: new Date(),
          })
          .where(eq(categories.id, id))
          .returning();

        const updated = updatedRows[0];
        if (!updated) {
          throw new NotFoundError("Kategori tidak ditemukan");
        }
        return updated;
      });
    },
  };
}
