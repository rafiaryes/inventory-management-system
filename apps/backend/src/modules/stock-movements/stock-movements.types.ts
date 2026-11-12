import type { SortOrder } from "../../common/pagination";
import type { ProductStatus, StockMovementType } from "../../db/schema";

export const STOCK_MOVEMENT_TYPES = ["in", "out"] as const;

export interface StockMovementProductSummary {
  id: string;
  sku: string;
  name: string;
  unit: string;
  status: ProductStatus;
}

export interface StockMovementCreatorSummary {
  id: string;
  name: string;
}

export interface StockMovementDto {
  id: string;
  product: StockMovementProductSummary;
  type: StockMovementType;
  quantity: string;
  stockBefore: string;
  stockAfter: string;
  reason: string;
  notes: string | null;
  createdBy: StockMovementCreatorSummary;
  createdAt: string;
}

export interface ListStockMovementsQuery {
  page: number;
  pageSize: number;
  productId?: string;
  type?: StockMovementType;
  createdBy?: string;
  startDate?: Date;
  endDate?: Date;
  sortOrder: SortOrder;
}

export interface CreateStockMovementInput {
  productId: string;
  type: StockMovementType;
  quantity: string;
  reason: string;
  notes?: string | null;
}
