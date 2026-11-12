import { Elysia } from "elysia";
import {
  errorEnvelopeSchema,
  paginatedResponse,
  successResponse,
} from "../../common/http";
import type { AuthPluginGuards } from "../../plugins/auth";
import {
  createStockMovementBodySchema,
  listStockMovementsQuerySchema,
  parseListStockMovementsQuery,
  stockMovementDetailResponseSchema,
  stockMovementIdParamSchema,
  stockMovementListResponseSchema,
  trimStockMovementBodyOnTransform,
} from "./stock-movements.schema";
import type { StockMovementsService } from "./stock-movements.service";

export interface CreateStockMovementsRoutesDeps {
  stockMovementsService: StockMovementsService;
  authPlugin: AuthPluginGuards;
}

/**
 * Defines immutable `/api/v1/stock-movements/*` endpoints for Admin and Staff.
 */
export function createStockMovementsRoutes(
  deps: CreateStockMovementsRoutesDeps,
) {
  const { stockMovementsService, authPlugin } = deps;

  return new Elysia({
    name: "stock-movements-routes",
    prefix: "/stock-movements",
  })
    .use(authPlugin.requireAuth)
    .get(
      "/",
      async ({ query }) => {
        const parsedQuery = parseListStockMovementsQuery(query);
        const result =
          await stockMovementsService.listStockMovements(parsedQuery);
        return paginatedResponse(
          "Data pergerakan stok berhasil diambil",
          result.items,
          result.meta,
        );
      },
      {
        query: listStockMovementsQuerySchema,
        response: {
          200: stockMovementListResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Stock Movements"],
          summary: "Mengambil riwayat pergerakan stok dengan filter dan paginasi",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const movement = await stockMovementsService.getStockMovementById(
          params.id,
        );
        return successResponse("Data pergerakan stok berhasil diambil", movement);
      },
      {
        params: stockMovementIdParamSchema,
        response: {
          200: stockMovementDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Stock Movements"],
          summary: "Mengambil detail satu transaksi pergerakan stok",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .post(
      "/",
      async ({ body, authUser, set }) => {
        const created = await stockMovementsService.createStockMovement(
          body,
          authUser.id,
        );
        set.status = 201;
        return successResponse("Pergerakan stok berhasil dicatat", created);
      },
      {
        transform(context) {
          trimStockMovementBodyOnTransform(context.body);
        },
        body: createStockMovementBodySchema,
        response: {
          201: stockMovementDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Stock Movements"],
          summary: "Mencatat transaksi Stock In atau Stock Out secara atomik",
          security: [{ cookieAuth: [] }],
        },
      },
    );
}
