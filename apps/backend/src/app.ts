import { Elysia, t } from "elysia";
import { getEnv, type BackendEnv } from "./config/env";
import { checkDatabaseHealth, db as defaultDb, type Database } from "./db";
import {
  createLoginRateLimiter,
  type LoginRateLimiter,
} from "./modules/auth/auth.rate-limiter";
import { createAuthRepository } from "./modules/auth/auth.repository";
import { createAuthRoutes } from "./modules/auth/auth.route";
import { createAuthService } from "./modules/auth/auth.service";
import { createAuthPlugin } from "./plugins/auth";
import { createCorsPlugin } from "./plugins/cors";
import { createCsrfPlugin } from "./plugins/csrf";
import { errorHandlerPlugin } from "./plugins/error-handler";
import { createOpenApiPlugin } from "./plugins/openapi";
import { requestIdPlugin } from "./plugins/request-id";

export interface AppDependencies {
  env?: BackendEnv;
  db?: Database;
  checkDbHealth?: () => Promise<boolean>;
  loginRateLimiter?: LoginRateLimiter;
}

/**
 * Creates the configured Elysia application instance for the backend.
 */
export function createApp(deps: AppDependencies = {}) {
  const env = deps.env ?? getEnv();
  const database = deps.db ?? defaultDb;
  const probeDatabase = deps.checkDbHealth ?? checkDatabaseHealth;
  const loginRateLimiter =
    deps.loginRateLimiter ??
    createLoginRateLimiter({
      maxAttempts: env.LOGIN_RATE_LIMIT_MAX,
      windowSeconds: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    });

  const authRepository = createAuthRepository(database);
  const authService = createAuthService({
    repository: authRepository,
    rateLimiter: loginRateLimiter,
    env,
  });
  const authPlugin = createAuthPlugin({ authService, env });
  const authRoutes = createAuthRoutes({ authService, authPlugin, env });

  const v1Routes = new Elysia({
    name: "api-v1",
    prefix: "/api/v1",
  }).use(authRoutes);

  return new Elysia()
    .use(requestIdPlugin)
    .use(errorHandlerPlugin)
    .use(createCorsPlugin(env.CORS_ALLOWED_ORIGINS))
    .use(createCsrfPlugin(env.CORS_ALLOWED_ORIGINS))
    .use(createOpenApiPlugin(env))
    .get(
      "/health",
      () => ({
        status: "ok" as const,
      }),
      {
        response: {
          200: t.Object({
            status: t.Literal("ok"),
          }),
        },
        detail: {
          tags: ["Health"],
          summary: "Cek kesehatan proses aplikasi backend",
        },
      },
    )
    .get(
      "/health/db",
      async ({ set }) => {
        const connected = await probeDatabase();

        if (!connected) {
          set.status = 503;
          return {
            status: "error" as const,
            database: "disconnected" as const,
          };
        }

        return {
          status: "ok" as const,
          database: "connected" as const,
        };
      },
      {
        response: {
          200: t.Object({
            status: t.Literal("ok"),
            database: t.Literal("connected"),
          }),
          503: t.Object({
            status: t.Literal("error"),
            database: t.Literal("disconnected"),
          }),
        },
        detail: {
          tags: ["Health"],
          summary: "Cek konektivitas PostgreSQL database",
        },
      },
    )
    .use(v1Routes);
}

export type App = ReturnType<typeof createApp>;
