import { apiRequest } from "@/lib/api-client";
import type { ApiPaginatedResponse, ApiSuccessResponse } from "@/types/api";
import type {
  SortOrder,
  StockMovementDto,
  StockMovementType,
} from "@/types/inventory";

export interface ListStockMovementsParams {
  page?: number;
  pageSize?: number;
  productId?: string;
  type?: StockMovementType;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: SortOrder;
  signal?: AbortSignal;
}

export interface CreateStockMovementPayload {
  productId: string;
  type: StockMovementType;
  quantity: string;
  reason: string;
  notes?: string | null;
}

export const stockMovementsService = {
  async listStockMovements(
    params: ListStockMovementsParams = {},
  ): Promise<ApiPaginatedResponse<StockMovementDto>> {
    return apiRequest<ApiPaginatedResponse<StockMovementDto>>(
      "/stock-movements",
      {
        method: "GET",
        query: {
          page: params.page,
          pageSize: params.pageSize,
          productId: params.productId,
          type: params.type,
          createdBy: params.createdBy,
          startDate: params.startDate,
          endDate: params.endDate,
          sortOrder: params.sortOrder,
        },
        signal: params.signal,
      },
    );
  },

  async createStockMovement(
    payload: CreateStockMovementPayload,
  ): Promise<StockMovementDto> {
    const response = await apiRequest<ApiSuccessResponse<StockMovementDto>>(
      "/stock-movements",
      {
        method: "POST",
        body: payload,
      },
    );
    return response.data;
  },
};
