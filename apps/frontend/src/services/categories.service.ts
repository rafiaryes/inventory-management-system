import { apiRequest } from "@/lib/api-client";
import type { ApiPaginatedResponse, ApiSuccessResponse } from "@/types/api";
import type { CategoryDto, SortOrder } from "@/types/inventory";

export type CategorySortField = "createdAt" | "updatedAt" | "name" | "isActive";

export interface ListCategoriesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: CategorySortField;
  sortOrder?: SortOrder;
  signal?: AbortSignal;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string | null;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string | null;
}

export const categoriesService = {
  async listCategories(
    params: ListCategoriesParams = {},
  ): Promise<ApiPaginatedResponse<CategoryDto>> {
    return apiRequest<ApiPaginatedResponse<CategoryDto>>("/categories", {
      method: "GET",
      query: {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        isActive: params.isActive,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
      signal: params.signal,
    });
  },

  async createCategory(payload: CreateCategoryPayload): Promise<CategoryDto> {
    const response = await apiRequest<ApiSuccessResponse<CategoryDto>>(
      "/categories",
      {
        method: "POST",
        body: payload,
      },
    );
    return response.data;
  },

  async updateCategory(
    id: string,
    payload: UpdateCategoryPayload,
  ): Promise<CategoryDto> {
    const response = await apiRequest<ApiSuccessResponse<CategoryDto>>(
      `/categories/${id}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
    return response.data;
  },

  async updateCategoryStatus(
    id: string,
    isActive: boolean,
  ): Promise<CategoryDto> {
    const response = await apiRequest<ApiSuccessResponse<CategoryDto>>(
      `/categories/${id}/status`,
      {
        method: "PATCH",
        body: { isActive },
      },
    );
    return response.data;
  },
};
