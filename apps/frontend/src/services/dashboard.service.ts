import { apiRequest } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { DashboardOverviewDto } from "@/types/inventory";

export const dashboardService = {
  async getOverview(signal?: AbortSignal): Promise<DashboardOverviewDto> {
    const response = await apiRequest<
      ApiSuccessResponse<DashboardOverviewDto>
    >("/dashboard", {
      method: "GET",
      signal,
    });
    return response.data;
  },
};
