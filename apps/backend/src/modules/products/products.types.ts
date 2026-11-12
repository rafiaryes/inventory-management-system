import type { SortOrder } from "../../common/pagination";
import type { ProductStatus } from "../../db/schema";

export const PRODUCT_ADMIN_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "sku",
  "currentStock",
  "minimumStock",
  "status",
  "purchasePrice",
  "sellingPrice",
] as const;

export const PRODUCT_STAFF_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "sku",
  "currentStock",
  "minimumStock",
] as const;

export const PRODUCT_STAFF_FORBIDDEN_SORT_FIELDS = [
  "purchasePrice",
  "sellingPrice",
  "status",
] as const;

export const PRODUCT_STATUS_FILTERS = ["active", "inactive", "all"] as const;

export type ProductSortField = (typeof PRODUCT_ADMIN_SORT_FIELDS)[number];
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

export interface ProductCategorySummary {
  id: string;
  name: string;
}

export interface ProductStaffDto {
  id: string;
  category: ProductCategorySummary;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  currentStock: string;
  minimumStock: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductAdminDto extends ProductStaffDto {
  purchasePrice: string;
  sellingPrice: string;
}

export type ProductDto = ProductAdminDto | ProductStaffDto;

export interface ListProductsQuery {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  status: ProductStatusFilter;
  lowStock?: boolean;
  sortBy: ProductSortField;
  sortOrder: SortOrder;
}

export interface CreateProductInput {
  categoryId: string;
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  purchasePrice: string;
  sellingPrice: string;
  minimumStock?: string;
}

export interface UpdateProductInput {
  categoryId?: string;
  sku?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  minimumStock?: string;
}
