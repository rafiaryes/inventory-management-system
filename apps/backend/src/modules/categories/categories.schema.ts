import { t } from "elysia";
import { ValidationError } from "../../common/errors";
import { createPaginatedSchema, createSuccessSchema } from "../../common/http";
import { parseBaseListQuery, parseBooleanParam } from "../../common/pagination";
import {
  CATEGORY_SORT_FIELDS,
  type CategorySortField,
  type ListCategoriesQuery,
} from "./categories.types";

export const categoryIdParamSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const categoryDtoSchema = t.Object({
  id: t.String({ format: "uuid" }),
  name: t.String(),
  description: t.Nullable(t.String()),
  isActive: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

export const listCategoriesQuerySchema = t.Object({
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  search: t.Optional(t.String()),
  isActive: t.Optional(t.String()),
  sortBy: t.Optional(t.String()),
  sortOrder: t.Optional(t.String()),
});

export const createCategoryBodySchema = t.Object(
  {
    name: t.String({ minLength: 1, maxLength: 100 }),
    description: t.Optional(t.Nullable(t.String())),
  },
  { additionalProperties: false },
);

export const updateCategoryBodySchema = t.Object(
  {
    name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    description: t.Optional(t.Nullable(t.String())),
  },
  { additionalProperties: false },
);

export const updateCategoryStatusBodySchema = t.Object(
  {
    isActive: t.Boolean(),
  },
  { additionalProperties: false },
);

export const categoryListResponseSchema =
  createPaginatedSchema(categoryDtoSchema);
export const categoryDetailResponseSchema =
  createSuccessSchema(categoryDtoSchema);

const CATEGORY_SORT_FIELD_SET = new Set<string>(CATEGORY_SORT_FIELDS);

/**
 * Parses and validates query parameters for `GET /api/v1/categories`.
 */
export function parseListCategoriesQuery(raw: {
  page?: string;
  pageSize?: string;
  search?: string;
  isActive?: string;
  sortBy?: string;
  sortOrder?: string;
}): ListCategoriesQuery {
  const base = parseBaseListQuery(raw);
  const isActive = parseBooleanParam(raw.isActive, "isActive");

  let sortBy: CategorySortField = "createdAt";
  if (raw.sortBy !== undefined) {
    if (!CATEGORY_SORT_FIELD_SET.has(raw.sortBy)) {
      throw new ValidationError("Parameter sortBy tidak valid", [
        {
          field: "sortBy",
          message: `sortBy harus salah satu dari: ${CATEGORY_SORT_FIELDS.join(", ")}`,
        },
      ]);
    }
    sortBy = raw.sortBy as CategorySortField;
  }

  return {
    ...base,
    isActive,
    sortBy,
  };
}

/**
 * Trims category `name` prior to Elysia schema validation.
 */
export function trimCategoryNameOnTransform(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name === "string") {
    record.name = record.name.trim();
  }
}

/**
 * Normalizes optional nullable text descriptions (blank strings become `null`).
 */
export function normalizeNullableDescription(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
