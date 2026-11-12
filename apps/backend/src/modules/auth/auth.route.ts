import { Elysia } from "elysia";
import { errorEnvelopeSchema, successResponse } from "../../common/http";
import { extractClientIp } from "../../common/security";
import type { BackendEnv } from "../../config/env";
import {
  buildSessionCookieBase,
  type AuthPluginGuards,
} from "../../plugins/auth";
import {
  authMeSuccessResponseSchema,
  loginBodySchema,
  loginSuccessResponseSchema,
  logoutSuccessResponseSchema,
} from "./auth.schema";
import type { AuthService } from "./auth.service";

const SECONDS_PER_DAY = 86_400;

export interface CreateAuthRoutesDeps {
  authService: AuthService;
  authPlugin: AuthPluginGuards;
  env: Pick<
    BackendEnv,
    | "SESSION_COOKIE_NAME"
    | "SESSION_TTL_DAYS"
    | "COOKIE_SECURE"
    | "COOKIE_SAME_SITE"
  >;
}

/**
 * Defines `/api/v1/auth/*` endpoints for session login, inspection, and logout.
 */
export function createAuthRoutes(deps: CreateAuthRoutesDeps) {
  const { authService, authPlugin, env } = deps;
  const cookieBase = buildSessionCookieBase(env);

  const protectedAuthRoutes = new Elysia({ name: "auth-protected-routes" })
    .use(authPlugin.requireAuth)
    .get(
      "/me",
      ({ authUser }) =>
        successResponse("Session valid", {
          user: {
            id: authUser.id,
            name: authUser.name,
            email: authUser.email,
            role: authUser.role,
          },
        }),
      {
        response: {
          200: authMeSuccessResponseSchema,
          401: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Auth"],
          summary: "Mengambil profil pengguna dari sesi aktif",
          security: [{ cookieAuth: [] }],
        },
      },
    )
    .post(
      "/logout",
      async ({ authUser, cookie }) => {
        await authService.logout(authUser.sessionId);

        cookie[env.SESSION_COOKIE_NAME]?.set({
          ...cookieBase,
          value: "",
          maxAge: 0,
          expires: new Date(0),
        });

        return successResponse("Logout berhasil", null);
      },
      {
        response: {
          200: logoutSuccessResponseSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Auth"],
          summary: "Mencabut sesi saat ini dan menghapus cookie autentikasi",
          security: [{ cookieAuth: [] }],
        },
      },
    );

  return new Elysia({
    name: "auth-routes",
    prefix: "/auth",
  })
    .post(
      "/login",
      async ({ body, cookie, request, server }) => {
        const clientIp = extractClientIp(
          request,
          server?.requestIP(request)?.address ?? null,
        );

        const result = await authService.login({
          email: body.email,
          password: body.password,
          clientIp,
        });

        cookie[env.SESSION_COOKIE_NAME]?.set({
          ...cookieBase,
          value: result.rawSessionToken,
          maxAge: env.SESSION_TTL_DAYS * SECONDS_PER_DAY,
        });

        return successResponse("Login berhasil", {
          user: result.user,
        });
      },
      {
        transform(context) {
          if (
            typeof context.body === "object" &&
            context.body !== null &&
            "email" in context.body &&
            typeof context.body.email === "string"
          ) {
            context.body.email = context.body.email.trim();
          }
        },
        body: loginBodySchema,
        response: {
          200: loginSuccessResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
        detail: {
          tags: ["Auth"],
          summary: "Login pengguna dan membuat HttpOnly session cookie",
        },
      },
    )
    .use(protectedAuthRoutes);
}
