import {
  parseDecimalString,
  STOCK_MAX_INTEGER_DIGITS,
  STOCK_SCALE,
} from "../../common/decimal";
import { NotFoundError } from "../../common/errors";
import type { PaginationMeta } from "../../common/http";
import { buildPaginationMeta } from "../../common/pagination";
import { normalizeNullableDescription } from "../categories/categories.schema";
import type {
  StockMovementRecord,
  StockMovementsRepository,
} from "./stock-movements.repository";
import type {
  CreateStockMovementInput,
  ListStockMovementsQuery,
  StockMovementDto,
} from "./stock-movements.types";

export interface StockMovementsService {
  listStockMovements(query: ListStockMovementsQuery): Promise<{
    items: StockMovementDto[];
    meta: PaginationMeta;
  }>;
  getStockMovementById(id: string): Promise<StockMovementDto>;
  createStockMovement(
    input: CreateStockMovementInput,
    actorUserId: string,
  ): Promise<StockMovementDto>;
}

/**
 * Maps a persisted stock movement join record into the price-free API DTO.
 */
export function toStockMovementDto(
  record: StockMovementRecord,
): StockMovementDto {
  return {
    id: record.movement.id,
    product: record.product,
    type: record.movement.type,
    quantity: record.movement.quantity,
    stockBefore: record.movement.stockBefore,
    stockAfter: record.movement.stockAfter,
    reason: record.movement.reason,
    notes: record.movement.notes,
    createdBy: record.creator,
    createdAt: record.movement.createdAt.toISOString(),
  };
}

/**
 * Creates the business service for querying history and recording Stock In / Stock Out transactions.
 */
export function createStockMovementsService(
  repository: StockMovementsRepository,
): StockMovementsService {
  return {
    async listStockMovements(query: ListStockMovementsQuery): Promise<{
      items: StockMovementDto[];
      meta: PaginationMeta;
    }> {
      const result = await repository.findMany(query);
      return {
        items: result.items.map(toStockMovementDto),
        meta: buildPaginationMeta(query.page, query.pageSize, result.totalItems),
      };
    },

    async getStockMovementById(id: string): Promise<StockMovementDto> {
      const record = await repository.findById(id);
      if (!record) {
        throw new NotFoundError("Pergerakan stok tidak ditemukan");
      }

      return toStockMovementDto(record);
    },

    async createStockMovement(
      input: CreateStockMovementInput,
      actorUserId: string,
    ): Promise<StockMovementDto> {
      // Fail fast with 400 VALIDATION_ERROR on malformed decimal formats before locking a row.
      parseDecimalString(
        input.quantity,
        STOCK_SCALE,
        STOCK_MAX_INTEGER_DIGITS,
        "quantity",
      );

      const reason = input.reason.trim();
      const notes = normalizeNullableDescription(input.notes) ?? null;

      const created = await repository.createInTx({
        productId: input.productId,
        type: input.type,
        quantityRaw: input.quantity,
        reason,
        notes,
        createdById: actorUserId,
      });

      return toStockMovementDto(created);
    },
  };
}
