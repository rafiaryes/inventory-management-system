import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../common/errors";
import type { PaginationMeta } from "../../common/http";
import { buildPaginationMeta } from "../../common/pagination";
import type { CategoryRow, UserRole } from "../../db/schema";
import type { CategoriesRepository } from "./categories.repository";
import { normalizeNullableDescription } from "./categories.schema";
import type {
  CategoryDto,
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "./categories.types";

function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CategoriesService {
  listCategories(
    query: ListCategoriesQuery,
    actorRole: UserRole,
  ): Promise<{ items: CategoryDto[]; meta: PaginationMeta }>;
  getCategoryById(id: string, actorRole: UserRole): Promise<CategoryDto>;
  createCategory(input: CreateCategoryInput): Promise<CategoryDto>;
  updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDto>;
  updateCategoryStatus(id: string, isActive: boolean): Promise<CategoryDto>;
}

/**
 * Creates the business service layer for category management and RBAC visibility.
 */
export function createCategoriesService(
  repository: CategoriesRepository,
): CategoriesService {
  return {
    async listCategories(
      query: ListCategoriesQuery,
      actorRole: UserRole,
    ): Promise<{ items: CategoryDto[]; meta: PaginationMeta }> {
      if (actorRole === "staff" && query.isActive === false) {
        throw new ForbiddenError(
          "Staff tidak memiliki akses untuk melihat kategori nonaktif",
        );
      }

      const effectiveQuery: ListCategoriesQuery =
        actorRole === "staff" ? { ...query, isActive: true } : query;

      const { items, totalItems } = await repository.findMany(effectiveQuery);
      return {
        items: items.map(toCategoryDto),
        meta: buildPaginationMeta(
          effectiveQuery.page,
          effectiveQuery.pageSize,
          totalItems,
        ),
      };
    },

    async getCategoryById(
      id: string,
      actorRole: UserRole,
    ): Promise<CategoryDto> {
      const category = await repository.findById(id);
      if (!category) {
        throw new NotFoundError("Kategori tidak ditemukan");
      }

      if (actorRole === "staff" && !category.isActive) {
        throw new ForbiddenError(
          "Staff tidak memiliki akses untuk melihat kategori nonaktif",
        );
      }

      return toCategoryDto(category);
    },

    async createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
      const created = await repository.create({
        name: input.name.trim(),
        description: normalizeNullableDescription(input.description) ?? null,
      });
      return toCategoryDto(created);
    },

    async updateCategory(
      id: string,
      input: UpdateCategoryInput,
    ): Promise<CategoryDto> {
      if (input.name === undefined && input.description === undefined) {
        throw new ValidationError(
          "Minimal satu field harus dikirim untuk pembaruan",
        );
      }

      const updated = await repository.update(id, {
        name: input.name !== undefined ? input.name.trim() : undefined,
        description: normalizeNullableDescription(input.description),
      });
      return toCategoryDto(updated);
    },

    async updateCategoryStatus(
      id: string,
      isActive: boolean,
    ): Promise<CategoryDto> {
      const updated = await repository.updateStatusInTx(id, isActive);
      return toCategoryDto(updated);
    },
  };
}
