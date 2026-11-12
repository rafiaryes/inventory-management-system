import { apiRequest } from "@/lib/api-client";
import type { ApiPaginatedResponse, ApiSuccessResponse } from "@/types/api";
import type {
  ProductAdminDto,
  ProductDto,
  ProductStatus,
  SortOrder,
} from "@/types/inventory";

export type ProductSortField =
  | "createdAt"
  | "updatedAt"
  | "name"
  | "sku"
  | "currentStock"
  | "minimumStock"
  | "status"
  | "purchasePrice"
  | "sellingPrice";

export type ProductStatusFilter = "active" | "inactive" | "all";

export interface ListProductsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatusFilter;
  lowStock?: boolean;
  sortBy?: ProductSortField;
  sortOrder?: SortOrder;
  signal?: AbortSignal;
}

export interface CreateProductPayload {
  categoryId: string;
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  purchasePrice: string;
  sellingPrice: string;
  minimumStock?: string;
}

export interface UpdateProductPayload {
  categoryId?: string;
  sku?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  purchasePrice?: string;
  sellingPrice?: string;
  minimumStock?: string;
}

export const productsService = {
  async listProducts(
    params: ListProductsParams = {},
  ): Promise<ApiPaginatedResponse<ProductDto>> {
    return apiRequest<ApiPaginatedResponse<ProductDto>>("/products", {
      method: "GET",
      query: {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        categoryId: params.categoryId,
        status: params.status,
        lowStock: params.lowStock,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
      signal: params.signal,
    });
  },

  async getProductById(id: string, signal?: AbortSignal): Promise<ProductDto> {
    const response = await apiRequest<ApiSuccessResponse<ProductDto>>(
      `/products/${id}`,
      {
        method: "GET",
        signal,
      },
    );
    return response.data;
  },

  async createProduct(
    payload: CreateProductPayload,
  ): Promise<ProductAdminDto> {
    const response = await apiRequest<ApiSuccessResponse<ProductAdminDto>>(
      "/products",
      {
        method: "POST",
        body: payload,
      },
    );
    return response.data;
  },

  async updateProduct(
    id: string,
    payload: UpdateProductPayload,
  ): Promise<ProductAdminDto> {
    const response = await apiRequest<ApiSuccessResponse<ProductAdminDto>>(
      `/products/${id}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
    return response.data;
  },

  async updateProductStatus(
    id: string,
    status: ProductStatus,
  ): Promise<ProductAdminDto> {
    const response = await apiRequest<ApiSuccessResponse<ProductAdminDto>>(
      `/products/${id}/status`,
      {
        method: "PATCH",
        body: { status },
      },
    );
    return response.data;
  },
};
