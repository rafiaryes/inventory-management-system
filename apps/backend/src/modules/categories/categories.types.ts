import type { SortOrder } from "../../common/pagination";

export const CATEGORY_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "isActive",
] as const;

export type CategorySortField = (typeof CATEGORY_SORT_FIELDS)[number];

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListCategoriesQuery {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  sortBy: CategorySortField;
  sortOrder: SortOrder;
}

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
}
