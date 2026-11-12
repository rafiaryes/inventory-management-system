import { getCalendarMonthRangeUtc } from "../../common/timezone";
import type { DashboardRepository } from "./dashboard.repository";
import type { DashboardOverviewDto } from "./dashboard.types";

export interface DashboardService {
  getOverview(): Promise<DashboardOverviewDto>;
}

export interface CreateDashboardServiceDeps {
  repository: DashboardRepository;
  businessTimezone: string;
  now?: () => Date;
}

/**
 * Creates the dashboard summary service computing calendar-month movement metrics in `businessTimezone`.
 */
export function createDashboardService(
  deps: CreateDashboardServiceDeps,
): DashboardService {
  const { repository, businessTimezone, now = () => new Date() } = deps;

  return {
    async getOverview(): Promise<DashboardOverviewDto> {
      const monthRange = getCalendarMonthRangeUtc(businessTimezone, now());
      const data = await repository.getOverview(monthRange);

      return {
        summary: data.summary,
        lowStockProducts: data.lowStockProducts,
        recentStockMovements: data.recentStockMovements.map((item) => ({
          id: item.id,
          product: item.product,
          type: item.type,
          quantity: item.quantity,
          stockBefore: item.stockBefore,
          stockAfter: item.stockAfter,
          reason: item.reason,
          createdBy: item.createdBy,
          createdAt: item.createdAt.toISOString(),
        })),
      };
    },
  };
}
