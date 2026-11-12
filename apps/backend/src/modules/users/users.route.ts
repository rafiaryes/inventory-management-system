import { Elysia } from "elysia";
import {
  errorEnvelopeSchema,
  paginatedResponse,
  successResponse,
} from "../../common/http";
import type { BackendEnv } from "../../config/env";
import {
  buildSessionCookieBase,
  type AuthPluginGuards,
} from "../../plugins/auth";
import {
  createUserBodySchema,
  listUsersQuerySchema,
  parseListUsersQuery,
  resetUserPasswordBodySchema,
  resetUserPasswordResponseSchema,
  trimUserBodyStrings,
  updateUserBodySchema,
  updateUserStatusBodySchema,
  userDetailResponseSchema,
  userIdParamSchema,
  userListResponseSchema,
} from "./users.schema";
import type { UsersService } from "./users.service";

export interface CreateUsersRoutesDeps {
  usersService: UsersService;
  authPlugin: AuthPluginGuards;
  env: Pick<
    BackendEnv,
    "SESSION_COOKIE_NAME" | "COOKIE_SECURE" | "COOKIE_SAME_SITE"
  >;
}

/**
 * Defines Admin-only `/api/v1/users/*` endpoints.
 */
export function createUsersRoutes(deps: CreateUsersRoutesDeps) {
  const { usersService, authPlugin, env } = deps;
  const cookieBase = buildSessionCookieBase(env);

  return new Elysia({
    name: "users-routes",
    prefix: "/users",
  })
    .use(authPlugin.requireRole("admin"))
    .get(
      "/",
      async ({ query }) => {
        const parsedQuery = parseListUsersQuery(query);
        const result = await usersService.listUsers(parsedQuery);
        return paginatedResponse(
          "Data pengguna berhasil diambil",
          result.items,
          result.meta,
        );
      },
      {
        query: listUsersQuerySchema,
        response: {
          200: userListResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Users"],
          summary: "Mengambil daftar pengguna (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .post(
      "/",
      async ({ body, set }) => {
        const created = await usersService.createUser(body);
        set.status = 201;
        return successResponse("Pengguna berhasil dibuat", created);
      },
      {
        transform(context) {
          trimUserBodyStrings(context.body);
        },
        body: createUserBodySchema,
        response: {
          201: userDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Users"],
          summary: "Membuat pengguna baru (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .get(
      "/:id",
      async ({ params }) => {
        const user = await usersService.getUserById(params.id);
        return successResponse("Data pengguna berhasil diambil", user);
      },
      {
        params: userIdParamSchema,
        response: {
          200: userDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Users"],
          summary: "Mengambil detail pengguna berdasarkan ID (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id",
      async ({ params, body, authUser }) => {
        const updated = await usersService.updateUser(
          params.id,
          authUser.id,
          body,
        );
        return successResponse("Pengguna berhasil diperbarui", updated);
      },
      {
        transform(context) {
          trimUserBodyStrings(context.body);
        },
        params: userIdParamSchema,
        body: updateUserBodySchema,
        response: {
          200: userDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Users"],
          summary: "Memperbarui data pengguna (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id/status",
      async ({ params, body, authUser }) => {
        const updated = await usersService.updateUserStatus(
          params.id,
          authUser.id,
          body.isActive,
        );
        return successResponse("Status pengguna berhasil diperbarui", updated);
      },
      {
        params: userIdParamSchema,
        body: updateUserStatusBodySchema,
        response: {
          200: userDetailResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          422: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Users"],
          summary: "Mengaktifkan atau menonaktifkan pengguna (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .patch(
      "/:id/password",
      async ({ params, body, authUser, cookie }) => {
        await usersService.resetUserPassword(params.id, body.newPassword);

        if (params.id === authUser.id) {
          cookie[env.SESSION_COOKIE_NAME]?.set({
            ...cookieBase,
            value: "",
            maxAge: 0,
            expires: new Date(0),
          });
        }

        return successResponse("Password pengguna berhasil direset", null);
      },
      {
        params: userIdParamSchema,
        body: resetUserPasswordBodySchema,
        response: {
          200: resetUserPasswordResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Users"],
          summary: "Mereset password pengguna dan mencabut seluruh sesinya (Admin)",
          security: [{ cookieAuth: [] }],
        },
      },
    );
}
