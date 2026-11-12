import { Elysia } from "elysia";
import { errorEnvelopeSchema, successResponse } from "../../common/http";
import type { AuthPluginGuards } from "../../plugins/auth";
import { dashboardResponseSchema } from "./dashboard.schema";
import type { DashboardService } from "./dashboard.service";

export interface CreateDashboardRoutesDeps {
  dashboardService: DashboardService;
  authPlugin: AuthPluginGuards;
}

/**
 * Defines `/api/v1/dashboard` providing the unified price-free inventory overview for Admin and Staff.
 */
export function createDashboardRoutes(deps: CreateDashboardRoutesDeps) {
  const { dashboardService, authPlugin } = deps;

  return new Elysia({
    name: "dashboard-routes",
    prefix: "/dashboard",
  })
    .use(authPlugin.requireAuth)
    .get(
      "/",
      async () => {
        const overview = await dashboardService.getOverview();
        return successResponse("Data ringkasan dashboard berhasil diambil", overview);
      },
      {
        response: {
          200: dashboardResponseSchema,
          401: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Dashboard"],
          summary: "Mengambil ringkasan operasional inventaris, produk stok menipis, dan pergerakan terbaru",
          security: [{ cookieAuth: [] }],
        },
      },
    );
}
