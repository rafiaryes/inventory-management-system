import type { StockMovementType } from "../../db/schema";

export interface DashboardSummaryDto {
  activeProductCount: number;
  activeCategoryCount: number;
  lowStockCount: number;
  stockInCount: number;
  stockOutCount: number;
}

export interface DashboardLowStockProductDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
}

export interface DashboardRecentMovementDto {
  id: string;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };
  type: StockMovementType;
  quantity: string;
  stockBefore: string;
  stockAfter: string;
  reason: string;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface DashboardOverviewDto {
  summary: DashboardSummaryDto;
  lowStockProducts: DashboardLowStockProductDto[];
  recentStockMovements: DashboardRecentMovementDto[];
}
