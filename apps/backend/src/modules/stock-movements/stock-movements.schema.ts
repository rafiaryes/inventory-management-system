import { t } from "elysia";
import { ValidationError } from "../../common/errors";
import { createPaginatedSchema, createSuccessSchema } from "../../common/http";
import { parseBaseListQuery } from "../../common/pagination";
import { parseIsoDateTimeWithTimezone } from "../../common/timezone";
import type { StockMovementType } from "../../db/schema";
import {
  STOCK_MOVEMENT_TYPES,
  type ListStockMovementsQuery,
} from "./stock-movements.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOCK_MOVEMENT_TYPE_SET = new Set<string>(STOCK_MOVEMENT_TYPES);

export const stockMovementIdParamSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const stockMovementDtoSchema = t.Object({
  id: t.String({ format: "uuid" }),
  product: t.Object({
    id: t.String({ format: "uuid" }),
    sku: t.String(),
    name: t.String(),
    unit: t.String(),
    status: t.Union([t.Literal("active"), t.Literal("inactive")]),
  }),
  type: t.Union([t.Literal("in"), t.Literal("out")]),
  quantity: t.String(),
  stockBefore: t.String(),
  stockAfter: t.String(),
  reason: t.String(),
  notes: t.Nullable(t.String()),
  createdBy: t.Object({
    id: t.String({ format: "uuid" }),
    name: t.String(),
  }),
  createdAt: t.String({ format: "date-time" }),
});

export const stockMovementListResponseSchema = createPaginatedSchema(
  stockMovementDtoSchema,
);

export const stockMovementDetailResponseSchema = createSuccessSchema(
  stockMovementDtoSchema,
);

export const listStockMovementsQuerySchema = t.Object({
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  productId: t.Optional(t.String()),
  type: t.Optional(t.String()),
  createdBy: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sortOrder: t.Optional(t.String()),
});

export const createStockMovementBodySchema = t.Object(
  {
    productId: t.String({ format: "uuid" }),
    type: t.Union([t.Literal("in"), t.Literal("out")]),
    quantity: t.String({ minLength: 1 }),
    reason: t.String({ minLength: 1, maxLength: 255 }),
    notes: t.Optional(t.Nullable(t.String())),
  },
  { additionalProperties: false },
);

function parseOptionalUuidParam(
  rawValue: string | undefined,
  field: string,
): string | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    throw new ValidationError(`Filter ${field} tidak valid`, [
      { field, message: `${field} harus berupa UUID valid` },
    ]);
  }

  return trimmed;
}

/**
 * Parses and validates query filters and half-open `[startDate, endDate)` bounds for stock movement history.
 */
export function parseListStockMovementsQuery(raw: {
  page?: string;
  pageSize?: string;
  productId?: string;
  type?: string;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: string;
}): ListStockMovementsQuery {
  const base = parseBaseListQuery({
    page: raw.page,
    pageSize: raw.pageSize,
    sortOrder: raw.sortOrder,
  });

  const productId = parseOptionalUuidParam(raw.productId, "productId");
  const createdBy = parseOptionalUuidParam(raw.createdBy, "createdBy");

  let type: StockMovementType | undefined;
  if (raw.type !== undefined) {
    if (!STOCK_MOVEMENT_TYPE_SET.has(raw.type)) {
      throw new ValidationError("Filter type pergerakan stok tidak valid", [
        { field: "type", message: "type harus bernilai 'in' atau 'out'" },
      ]);
    }
    type = raw.type as StockMovementType;
  }

  const startDate = parseIsoDateTimeWithTimezone(raw.startDate, "startDate");
  const endDate = parseIsoDateTimeWithTimezone(raw.endDate, "endDate");

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new ValidationError("Rentang tanggal tidak valid", [
      {
        field: "startDate",
        message: "startDate tidak boleh lebih besar dari endDate",
      },
    ]);
  }

  return {
    page: base.page,
    pageSize: base.pageSize,
    productId,
    type,
    createdBy,
    startDate,
    endDate,
    sortOrder: base.sortOrder,
  };
}

/**
 * Trims `reason` prior to Elysia schema validation so whitespace-only reasons fail `minLength: 1` (`400`).
 */
export function trimStockMovementBodyOnTransform(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.reason === "string") {
    record.reason = record.reason.trim();
  }
}
