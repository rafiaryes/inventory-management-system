import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@/types/api";
import type { AuthUser, AuthUserData, LoginPayload } from "@/types/auth";

export const authService = {
  async login(payload: LoginPayload): Promise<AuthUser> {
    const response = await apiRequest<ApiSuccessResponse<AuthUserData>>(
      "/auth/login",
      {
        method: "POST",
        body: {
          email: payload.email.trim().toLowerCase(),
          password: payload.password,
        },
        skipUnauthorizedHandler: true,
      },
    );
    return response.data.user;
  },

  async logout(): Promise<void> {
    await apiRequest<ApiSuccessResponse<null>>("/auth/logout", {
      method: "POST",
      skipUnauthorizedHandler: true,
    });
  },

  async getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
    try {
      const response = await apiRequest<ApiSuccessResponse<AuthUserData>>(
        "/auth/me",
        {
          method: "GET",
          signal,
          skipUnauthorizedHandler: true,
        },
      );
      return response.data.user;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },
};
