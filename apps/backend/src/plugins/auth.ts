import { Elysia, type Cookie } from "elysia";
import { ForbiddenError, UnauthenticatedError } from "../common/errors";
import type { CookieSameSite, BackendEnv } from "../config/env";
import type { UserRole } from "../db/schema";
import type { AuthService } from "../modules/auth/auth.service";
import type { AuthContextUser } from "../modules/auth/auth.types";

export interface SessionCookieConfig {
  httpOnly: true;
  secure: boolean;
  sameSite: CookieSameSite;
  path: "/";
}

/**
 * Builds consistent cookie attributes shared by login and logout Set-Cookie headers.
 */
export function buildSessionCookieBase(
  env: Pick<BackendEnv, "COOKIE_SECURE" | "COOKIE_SAME_SITE">,
): SessionCookieConfig {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
  };
}

export interface CreateAuthPluginDeps {
  authService: AuthService;
  env: Pick<BackendEnv, "SESSION_COOKIE_NAME">;
}

/**
 * Creates reusable authentication and RBAC guard plugins backed by DB sessions.
 */
export function createAuthPlugin(deps: CreateAuthPluginDeps) {
  const { authService, env } = deps;
  const resolvedAuthCache = new WeakMap<Request, AuthContextUser>();

  async function authenticateRequest(
    request: Request,
    cookie: Record<string, Cookie<unknown>>,
  ): Promise<AuthContextUser> {
    const cached = resolvedAuthCache.get(request);
    if (cached) {
      return cached;
    }

    const cookieEntry = cookie[env.SESSION_COOKIE_NAME];
    const rawToken =
      typeof cookieEntry?.value === "string" ? cookieEntry.value : "";

    const authUser = await authService.authenticateSession(rawToken);
    if (!authUser) {
      throw new UnauthenticatedError(
        "Autentikasi diperlukan atau sesi tidak valid",
      );
    }

    resolvedAuthCache.set(request, authUser);
    return authUser;
  }

  const requireAuth = new Elysia({
    name: "require-auth",
    seed: deps,
  }).resolve({ as: "scoped" }, async ({ request, cookie }) => ({
    authUser: await authenticateRequest(request, cookie),
  }));

  function requireRole(...allowedRoles: UserRole[]) {
    const allowedRoleSet = new Set<UserRole>(allowedRoles);

    return new Elysia({
      name: `require-role:${allowedRoles.join(",")}`,
      seed: { deps, allowedRoles },
    })
      .resolve({ as: "scoped" }, async ({ request, cookie }) => ({
        authUser: await authenticateRequest(request, cookie),
      }))
      .onBeforeHandle({ as: "scoped" }, ({ authUser }) => {
        if (!allowedRoleSet.has(authUser.role)) {
          throw new ForbiddenError(
            "Anda tidak memiliki akses untuk melakukan tindakan ini",
          );
        }
      });
  }

  return {
    requireAuth,
    requireRole,
  };
}

export type AuthPluginGuards = ReturnType<typeof createAuthPlugin>;
