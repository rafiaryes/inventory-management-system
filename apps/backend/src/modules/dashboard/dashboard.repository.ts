import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
  categories,
  products,
  stockMovements,
  users,
  type StockMovementType,
} from "../../db/schema";
import type {
  DashboardLowStockProductDto,
  DashboardSummaryDto,
} from "./dashboard.types";

export interface DashboardMonthRange {
  startUtc: Date;
  endUtc: Date;
}

export interface DashboardRecentMovementRecord {
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
  createdAt: Date;
}

export interface DashboardRepositoryData {
  summary: DashboardSummaryDto;
  lowStockProducts: DashboardLowStockProductDto[];
  recentStockMovements: DashboardRecentMovementRecord[];
}

export interface DashboardRepository {
  getOverview(monthRange: DashboardMonthRange): Promise<DashboardRepositoryData>;
}

const DASHBOARD_LIST_LIMIT = 10;

/**
 * Creates the read-only aggregation repository for the inventory dashboard.
 */
export function createDashboardRepository(db: Database): DashboardRepository {
  return {
    async getOverview(
      monthRange: DashboardMonthRange,
    ): Promise<DashboardRepositoryData> {
      const lowStockCondition = and(
        eq(products.status, "active"),
        lte(products.currentStock, products.minimumStock),
      );

      const monthMovementCondition = and(
        gte(stockMovements.createdAt, monthRange.startUtc),
        lt(stockMovements.createdAt, monthRange.endUtc),
      );

      const [
        productCounts,
        categoryCounts,
        movementCounts,
        lowStockProducts,
        recentStockMovements,
      ] = await Promise.all([
        db
          .select({
            activeProductCount: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
            lowStockCount: sql<number>`count(*) filter (where ${products.status} = 'active' and ${products.currentStock} <= ${products.minimumStock})::int`,
          })
          .from(products),
        db
          .select({
            activeCategoryCount: sql<number>`count(*) filter (where ${categories.isActive} = true)::int`,
          })
          .from(categories),
        db
          .select({
            stockInCount: sql<number>`count(*) filter (where ${stockMovements.type} = 'in')::int`,
            stockOutCount: sql<number>`count(*) filter (where ${stockMovements.type} = 'out')::int`,
          })
          .from(stockMovements)
          .where(monthMovementCondition),
        db
          .select({
            id: products.id,
            sku: products.sku,
            name: products.name,
            unit: products.unit,
            currentStock: products.currentStock,
            minimumStock: products.minimumStock,
          })
          .from(products)
          .where(lowStockCondition)
          .orderBy(
            desc(sql`${products.minimumStock} - ${products.currentStock}`),
            asc(products.currentStock),
            asc(products.id),
          )
          .limit(DASHBOARD_LIST_LIMIT),
        db
          .select({
            id: stockMovements.id,
            product: {
              id: products.id,
              sku: products.sku,
              name: products.name,
              unit: products.unit,
            },
            type: stockMovements.type,
            quantity: stockMovements.quantity,
            stockBefore: stockMovements.stockBefore,
            stockAfter: stockMovements.stockAfter,
            reason: stockMovements.reason,
            createdBy: {
              id: users.id,
              name: users.name,
            },
            createdAt: stockMovements.createdAt,
          })
          .from(stockMovements)
          .innerJoin(products, eq(stockMovements.productId, products.id))
          .innerJoin(users, eq(stockMovements.createdBy, users.id))
          .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
          .limit(DASHBOARD_LIST_LIMIT),
      ]);

      return {
        summary: {
          activeProductCount: productCounts[0]?.activeProductCount ?? 0,
          activeCategoryCount: categoryCounts[0]?.activeCategoryCount ?? 0,
          lowStockCount: productCounts[0]?.lowStockCount ?? 0,
          stockInCount: movementCounts[0]?.stockInCount ?? 0,
          stockOutCount: movementCounts[0]?.stockOutCount ?? 0,
        },
        lowStockProducts,
        recentStockMovements,
      };
    },
  };
}
