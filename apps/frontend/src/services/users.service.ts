import { apiRequest } from "@/lib/api-client";
import type { ApiPaginatedResponse, ApiSuccessResponse } from "@/types/api";
import type { UserRole } from "@/types/auth";
import type { SortOrder, UserDto } from "@/types/inventory";

export type UserSortField =
  | "createdAt"
  | "updatedAt"
  | "name"
  | "email"
  | "role"
  | "isActive";

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  sortBy?: UserSortField;
  sortOrder?: SortOrder;
  signal?: AbortSignal;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
}

export const usersService = {
  async listUsers(
    params: ListUsersParams = {},
  ): Promise<ApiPaginatedResponse<UserDto>> {
    return apiRequest<ApiPaginatedResponse<UserDto>>("/users", {
      method: "GET",
      query: {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        role: params.role,
        isActive: params.isActive,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
      signal: params.signal,
    });
  },

  async createUser(payload: CreateUserPayload): Promise<UserDto> {
    const response = await apiRequest<ApiSuccessResponse<UserDto>>("/users", {
      method: "POST",
      body: payload,
    });
    return response.data;
  },

  async updateUser(id: string, payload: UpdateUserPayload): Promise<UserDto> {
    const response = await apiRequest<ApiSuccessResponse<UserDto>>(
      `/users/${id}`,
      {
        method: "PATCH",
        body: payload,
      },
    );
    return response.data;
  },

  async updateUserStatus(id: string, isActive: boolean): Promise<UserDto> {
    const response = await apiRequest<ApiSuccessResponse<UserDto>>(
      `/users/${id}/status`,
      {
        method: "PATCH",
        body: { isActive },
      },
    );
    return response.data;
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await apiRequest<ApiSuccessResponse<null>>(`/users/${id}/password`, {
      method: "PATCH",
      body: { newPassword },
    });
  },
};
