import {
  parseMinimumStock,
  parseNonNegativePrice,
} from "../../common/decimal";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../common/errors";
import type { PaginationMeta } from "../../common/http";
import { buildPaginationMeta } from "../../common/pagination";
import type { ProductStatus, UserRole } from "../../db/schema";
import { normalizeNullableDescription } from "../categories/categories.schema";
import type {
  ProductsRepository,
  ProductWithCategory,
} from "./products.repository";
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductAdminDto,
  ProductDto,
  ProductStaffDto,
  UpdateProductInput,
} from "./products.types";

function toProductStaffDto(row: ProductWithCategory): ProductStaffDto {
  const { product, categoryName } = row;
  return {
    id: product.id,
    category: {
      id: product.categoryId,
      name: categoryName,
    },
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    currentStock: product.currentStock,
    minimumStock: product.minimumStock,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toProductAdminDto(row: ProductWithCategory): ProductAdminDto {
  const { product, categoryName } = row;
  return {
    id: product.id,
    category: {
      id: product.categoryId,
      name: categoryName,
    },
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    currentStock: product.currentStock,
    minimumStock: product.minimumStock,
    status: product.status,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toProductDtoForRole(
  row: ProductWithCategory,
  actorRole: UserRole,
): ProductDto {
  return actorRole === "admin"
    ? toProductAdminDto(row)
    : toProductStaffDto(row);
}

export interface ProductsService {
  listProducts(
    query: ListProductsQuery,
    actorRole: UserRole,
  ): Promise<{ items: ProductDto[]; meta: PaginationMeta }>;
  getProductById(id: string, actorRole: UserRole): Promise<ProductDto>;
  createProduct(input: CreateProductInput): Promise<ProductAdminDto>;
  updateProduct(
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductAdminDto>;
  updateProductStatus(
    id: string,
    status: ProductStatus,
  ): Promise<ProductAdminDto>;
}

/**
 * Creates the business service layer for products, unit precision, and role-based price visibility.
 */
export function createProductsService(
  repository: ProductsRepository,
): ProductsService {
  return {
    async listProducts(
      query: ListProductsQuery,
      actorRole: UserRole,
    ): Promise<{ items: ProductDto[]; meta: PaginationMeta }> {
      const effectiveQuery: ListProductsQuery =
        actorRole === "staff" ? { ...query, status: "active" } : query;

      const { items, totalItems } = await repository.findMany(effectiveQuery);

      return {
        items: items.map((row) => toProductDtoForRole(row, actorRole)),
        meta: buildPaginationMeta(
          effectiveQuery.page,
          effectiveQuery.pageSize,
          totalItems,
        ),
      };
    },

    async getProductById(
      id: string,
      actorRole: UserRole,
    ): Promise<ProductDto> {
      const found = await repository.findById(id);
      if (!found) {
        throw new NotFoundError("Produk tidak ditemukan");
      }

      if (actorRole === "staff" && found.product.status !== "active") {
        throw new ForbiddenError(
          "Staff tidak memiliki akses untuk melihat produk nonaktif",
        );
      }

      return toProductDtoForRole(found, actorRole);
    },

    async createProduct(input: CreateProductInput): Promise<ProductAdminDto> {
      const normalizedSku = input.sku.trim().toUpperCase();
      const normalizedName = input.name.trim();
      const normalizedUnit = input.unit.trim().toLowerCase();
      const normalizedDescription =
        normalizeNullableDescription(input.description) ?? null;

      const purchasePrice = parseNonNegativePrice(
        input.purchasePrice,
        "purchasePrice",
      );
      const sellingPrice = parseNonNegativePrice(
        input.sellingPrice,
        "sellingPrice",
      );
      const minimumStock = parseMinimumStock(
        input.minimumStock ?? "0",
        normalizedUnit,
        "minimumStock",
      );

      const created = await repository.createInTx({
        categoryId: input.categoryId,
        sku: normalizedSku,
        name: normalizedName,
        description: normalizedDescription,
        unit: normalizedUnit,
        purchasePrice,
        sellingPrice,
        minimumStock,
      });

      return toProductAdminDto(created);
    },

    async updateProduct(
      id: string,
      input: UpdateProductInput,
    ): Promise<ProductAdminDto> {
      const hasChanges =
        input.categoryId !== undefined ||
        input.sku !== undefined ||
        input.name !== undefined ||
        input.description !== undefined ||
        input.unit !== undefined ||
        input.purchasePrice !== undefined ||
        input.sellingPrice !== undefined ||
        input.minimumStock !== undefined;

      if (!hasChanges) {
        throw new ValidationError(
          "Minimal satu field harus dikirim untuk pembaruan",
        );
      }

      const purchasePrice =
        input.purchasePrice !== undefined
          ? parseNonNegativePrice(input.purchasePrice, "purchasePrice")
          : undefined;
      const sellingPrice =
        input.sellingPrice !== undefined
          ? parseNonNegativePrice(input.sellingPrice, "sellingPrice")
          : undefined;

      const updated = await repository.updateInTx(id, {
        categoryId: input.categoryId,
        sku:
          input.sku !== undefined ? input.sku.trim().toUpperCase() : undefined,
        name: input.name !== undefined ? input.name.trim() : undefined,
        description: normalizeNullableDescription(input.description),
        unit:
          input.unit !== undefined
            ? input.unit.trim().toLowerCase()
            : undefined,
        purchasePrice,
        sellingPrice,
        minimumStock: input.minimumStock,
      });

      return toProductAdminDto(updated);
    },

    async updateProductStatus(
      id: string,
      status: ProductStatus,
    ): Promise<ProductAdminDto> {
      const updated = await repository.updateStatusInTx(id, status);
      return toProductAdminDto(updated);
    },
  };
}
