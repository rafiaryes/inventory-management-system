import { openapi } from "@elysiajs/openapi";
import type { BackendEnv } from "../config/env";

/**
 * Configures Swagger/OpenAPI UI outside `/api/v1` (enabled strictly when configured).
 */
export function createOpenApiPlugin(env: Pick<BackendEnv, "ENABLE_SWAGGER" | "SESSION_COOKIE_NAME">) {
  return openapi({
    enabled: env.ENABLE_SWAGGER,
    provider: "swagger-ui",
    path: "/docs",
    specPath: "/docs/json",
    documentation: {
      info: {
        title: "Inventory Management System API",
        version: "1.0.0",
        description:
          "REST API dokumentasi untuk Inventory Management System (Single-Warehouse MVP).",
      },
      tags: [
        {
          name: "Health",
          description: "Endpoint operasional status aplikasi dan database",
        },
        {
          name: "Auth",
          description: "Autentikasi berbasis session cookie dan informasi pengguna aktif",
        },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: env.SESSION_COOKIE_NAME,
            description: "HttpOnly session cookie yang diterbitkan saat login",
          },
        },
      },
    },
  });
}
