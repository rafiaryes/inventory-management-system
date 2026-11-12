import { t } from "elysia";
import { ForbiddenError, ValidationError } from "../../common/errors";
import { createPaginatedSchema, createSuccessSchema } from "../../common/http";
import { parseBaseListQuery, parseBooleanParam } from "../../common/pagination";
import type { UserRole } from "../../db/schema";
import {
  PRODUCT_ADMIN_SORT_FIELDS,
  PRODUCT_STAFF_FORBIDDEN_SORT_FIELDS,
  PRODUCT_STATUS_FILTERS,
  type ListProductsQuery,
  type ProductSortField,
  type ProductStatusFilter,
} from "./products.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const productIdParamSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

const productCategorySummarySchema = t.Object({
  id: t.String({ format: "uuid" }),
  name: t.String(),
});

export const productStaffDtoSchema = t.Object(
  {
    id: t.String({ format: "uuid" }),
    category: productCategorySummarySchema,
    sku: t.String(),
    name: t.String(),
    description: t.Nullable(t.String()),
    unit: t.String(),
    currentStock: t.String(),
    minimumStock: t.String(),
    status: t.Union([t.Literal("active"), t.Literal("inactive")]),
    createdAt: t.String({ format: "date-time" }),
    updatedAt: t.String({ format: "date-time" }),
  },
  {
    title: "ProductStaffDto",
    description:
      "DTO produk untuk peran Staff. Field purchasePrice dan sellingPrice tidak pernah dikirim oleh backend.",
  },
);

export const productAdminDtoSchema = t.Object(
  {
    id: t.String({ format: "uuid" }),
    category: productCategorySummarySchema,
    sku: t.String(),
    name: t.String(),
    description: t.Nullable(t.String()),
    unit: t.String(),
    purchasePrice: t.String({
      description: "Harga beli produk dalam format NUMERIC(14,2) string (hanya untuk Admin)",
    }),
    sellingPrice: t.String({
      description: "Harga jual produk dalam format NUMERIC(14,2) string (hanya untuk Admin)",
    }),
    currentStock: t.String(),
    minimumStock: t.String(),
    status: t.Union([t.Literal("active"), t.Literal("inactive")]),
    createdAt: t.String({ format: "date-time" }),
    updatedAt: t.String({ format: "date-time" }),
  },
  {
    title: "ProductAdminDto",
    description:
      "DTO produk lengkap khusus untuk peran Admin, mencakup field purchasePrice dan sellingPrice.",
  },
);

export const listProductsQuerySchema = t.Object({
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  search: t.Optional(t.String()),
  categoryId: t.Optional(t.String()),
  status: t.Optional(t.String()),
  lowStock: t.Optional(t.String()),
  sortBy: t.Optional(t.String()),
  sortOrder: t.Optional(t.String()),
});

export const createProductBodySchema = t.Object(
  {
    categoryId: t.String({ format: "uuid" }),
    sku: t.String({
      minLength: 1,
      maxLength: 50,
      pattern: "^[A-Z0-9-]+$",
    }),
    name: t.String({ minLength: 1, maxLength: 150 }),
    description: t.Optional(t.Nullable(t.String())),
    unit: t.String({ minLength: 1, maxLength: 30 }),
    purchasePrice: t.String({ minLength: 1 }),
    sellingPrice: t.String({ minLength: 1 }),
    minimumStock: t.Optional(t.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const updateProductBodySchema = t.Object(
  {
    categoryId: t.Optional(t.String({ format: "uuid" })),
    sku: t.Optional(
      t.String({
        minLength: 1,
        maxLength: 50,
        pattern: "^[A-Z0-9-]+$",
      }),
    ),
    name: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
    description: t.Optional(t.Nullable(t.String())),
    unit: t.Optional(t.String({ minLength: 1, maxLength: 30 })),
    purchasePrice: t.Optional(t.String({ minLength: 1 })),
    sellingPrice: t.Optional(t.String({ minLength: 1 })),
    minimumStock: t.Optional(t.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const updateProductStatusBodySchema = t.Object(
  {
    status: t.Union([t.Literal("active"), t.Literal("inactive")]),
  },
  { additionalProperties: false },
);

export const productListResponseSchema = createPaginatedSchema(
  t.Union([productAdminDtoSchema, productStaffDtoSchema]),
);

export const productDetailResponseSchema = createSuccessSchema(
  t.Union([productAdminDtoSchema, productStaffDtoSchema]),
);

export const productAdminDetailResponseSchema = createSuccessSchema(
  productAdminDtoSchema,
);

const PRODUCT_ADMIN_SORT_SET = new Set<string>(PRODUCT_ADMIN_SORT_FIELDS);
const PRODUCT_STAFF_FORBIDDEN_SORT_SET = new Set<string>(
  PRODUCT_STAFF_FORBIDDEN_SORT_FIELDS,
);
const PRODUCT_STATUS_FILTER_SET = new Set<string>(PRODUCT_STATUS_FILTERS);

/**
 * Parses and validates query parameters + Staff RBAC restrictions for `GET /api/v1/products`.
 */
export function parseListProductsQuery(
  raw: {
    page?: string;
    pageSize?: string;
    search?: string;
    categoryId?: string;
    status?: string;
    lowStock?: string;
    sortBy?: string;
    sortOrder?: string;
  },
  actorRole: UserRole,
): ListProductsQuery {
  const base = parseBaseListQuery(raw);

  let categoryId: string | undefined;
  if (raw.categoryId !== undefined) {
    const trimmedCategoryId = raw.categoryId.trim();
    if (!UUID_PATTERN.test(trimmedCategoryId)) {
      throw new ValidationError("Filter categoryId tidak valid", [
        { field: "categoryId", message: "categoryId harus berupa UUID valid" },
      ]);
    }
    categoryId = trimmedCategoryId;
  }

  let status: ProductStatusFilter = "active";
  if (raw.status !== undefined) {
    if (!PRODUCT_STATUS_FILTER_SET.has(raw.status)) {
      throw new ValidationError("Filter status produk tidak valid", [
        {
          field: "status",
          message: "status harus salah satu dari: active, inactive, all",
        },
      ]);
    }
    status = raw.status as ProductStatusFilter;
  }

  if (actorRole === "staff" && status !== "active") {
    throw new ForbiddenError(
      "Staff hanya memiliki akses untuk melihat produk aktif",
    );
  }

  const lowStock = parseBooleanParam(raw.lowStock, "lowStock");

  let sortBy: ProductSortField = "createdAt";
  if (raw.sortBy !== undefined) {
    if (!PRODUCT_ADMIN_SORT_SET.has(raw.sortBy)) {
      throw new ValidationError("Parameter sortBy tidak valid", [
        {
          field: "sortBy",
          message: `sortBy harus salah satu dari: ${PRODUCT_ADMIN_SORT_FIELDS.join(", ")}`,
        },
      ]);
    }

    if (
      actorRole === "staff" &&
      PRODUCT_STAFF_FORBIDDEN_SORT_SET.has(raw.sortBy)
    ) {
      throw new ForbiddenError(
        "Staff tidak diizinkan mengurutkan produk berdasarkan harga atau status",
      );
    }

    sortBy = raw.sortBy as ProductSortField;
  }

  return {
    ...base,
    categoryId,
    status,
    lowStock,
    sortBy,
  };
}

/**
 * Normalizes product `sku`, `name`, and `unit` prior to Elysia schema validation.
 */
export function normalizeProductBodyOnTransform(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.sku === "string") {
    record.sku = record.sku.trim().toUpperCase();
  }
  if (typeof record.name === "string") {
    record.name = record.name.trim();
  }
  if (typeof record.unit === "string") {
    record.unit = record.unit.trim().toLowerCase();
  }
}
