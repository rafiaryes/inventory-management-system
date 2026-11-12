import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import type { BackendEnv } from "../src/config/env";
import { errorHandlerPlugin } from "../src/plugins/error-handler";
import { requestIdPlugin } from "../src/plugins/request-id";

function createTestEnv(overrides: Partial<BackendEnv> = {}): BackendEnv {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/inventory_management",
    BUSINESS_TIMEZONE: "Asia/Jakarta",
    CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
    SESSION_COOKIE_NAME: "ims_session",
    SESSION_TTL_DAYS: 7,
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: "lax",
    LOGIN_RATE_LIMIT_MAX: 10,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
    ...overrides,
  };
}

describe("core backend infrastructure plugins", () => {
  test("generates X-Request-ID when omitted and preserves valid caller X-Request-ID", async () => {
    const app = createApp({ env: createTestEnv() });

    const generatedRes = await app.handle(new Request("http://localhost/health"));
    const generatedId = generatedRes.headers.get("x-request-id");
    expect(generatedRes.status).toBe(200);
    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const customId = "req-trace-12345";
    const echoedRes = await app.handle(
      new Request("http://localhost/api/v1/nonexistent", {
        headers: { "x-request-id": customId },
      }),
    );
    expect(echoedRes.status).toBe(404);
    expect(echoedRes.headers.get("x-request-id")).toBe(customId);

    const echoedBody = (await echoedRes.json()) as {
      success: boolean;
      error: { code: string; requestId: string };
    };
    expect(echoedBody.success).toBe(false);
    expect(echoedBody.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(echoedBody.error.requestId).toBe(customId);

    const invalidIdRes = await app.handle(
      new Request("http://localhost/health", {
        headers: { "x-request-id": "invalid id with spaces!" },
      }),
    );
    expect(invalidIdRes.headers.get("x-request-id")).not.toBe(
      "invalid id with spaces!",
    );
  });

  test("maps Elysia schema validation and invalid JSON parse errors to HTTP 400 VALIDATION_ERROR", async () => {
    const app = createApp({ env: createTestEnv() });

    const validationRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "short",
        }),
      }),
    );
    expect(validationRes.status).toBe(400);
    const validationBody = (await validationRes.json()) as {
      success: boolean;
      error: {
        code: string;
        details: Array<{ field?: string; message: string }>;
        requestId: string;
      };
    };
    expect(validationBody.success).toBe(false);
    expect(validationBody.error.code).toBe("VALIDATION_ERROR");
    expect(validationBody.error.details.length).toBeGreaterThan(0);
    expect(validationBody.error.requestId.length).toBeGreaterThan(0);

    const malformedJsonRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{invalid json",
      }),
    );
    expect(malformedJsonRes.status).toBe(400);
    const malformedBody = (await malformedJsonRes.json()) as {
      success: boolean;
      error: { code: string };
    };
    expect(malformedBody.success).toBe(false);
    expect(malformedBody.error.code).toBe("VALIDATION_ERROR");
  });

  test("redacts unexpected server errors without leaking internal messages or credentials", async () => {
    const app = new Elysia()
      .use(requestIdPlugin)
      .use(errorHandlerPlugin)
      .get("/boom", () => {
        throw new Error(
          "connect ECONNREFUSED postgresql://postgres:supersecret@db.internal:5432/ims",
        );
      });

    const originalConsoleError = console.error;
    const loggedLines: string[] = [];
    console.error = (...args: unknown[]) => {
      loggedLines.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      const response = await app.handle(new Request("http://localhost/boom"));
      expect(response.status).toBe(500);
      const bodyText = await response.text();
      expect(bodyText).not.toContain("supersecret");
      expect(bodyText).not.toContain("ECONNREFUSED");

      const parsed = JSON.parse(bodyText) as {
        success: boolean;
        error: { code: string; message: string; details: unknown[] };
      };
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(parsed.error.details).toEqual([]);

      expect(loggedLines.length).toBe(1);
      expect(loggedLines[0]).not.toContain("supersecret");
      expect(loggedLines[0]).toContain("postgresql://[REDACTED]");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("enforces explicit CORS allowlist and omits Access-Control-Allow-Origin for disallowed origins", async () => {
    const app = createApp({ env: createTestEnv() });

    const allowedPreflight = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "POST",
          "access-control-request-headers": "Content-Type, X-Request-ID",
        },
      }),
    );
    expect(allowedPreflight.status).toBe(204);
    expect(allowedPreflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(
      allowedPreflight.headers.get("access-control-allow-credentials"),
    ).toBe("true");
    expect(
      allowedPreflight.headers.get("access-control-allow-origin"),
    ).not.toBe("*");

    const disallowedRes = await app.handle(
      new Request("http://localhost/health", {
        headers: { origin: "https://evil.example.com" },
      }),
    );
    expect(disallowedRes.status).toBe(200);
    expect(disallowedRes.headers.get("access-control-allow-origin")).toBeNull();
    expect(disallowedRes.headers.get("vary")).toContain("Origin");
  });

  test("enforces Origin and fallback Referer CSRF check on state-changing requests", async () => {
    const app = createApp({ env: createTestEnv() });

    const badOriginRes = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          origin: "https://attacker.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "user@example.com",
          password: "password123",
        }),
      }),
    );
    expect(badOriginRes.status).toBe(403);
    const badOriginBody = (await badOriginRes.json()) as {
      error: { code: string };
    };
    expect(badOriginBody.error.code).toBe("FORBIDDEN");

    const nullOriginRes = await app.handle(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { origin: "null" },
      }),
    );
    expect(nullOriginRes.status).toBe(403);

    const badRefererRes = await app.handle(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { referer: "https://evil.example.com/attack.html" },
      }),
    );
    expect(badRefererRes.status).toBe(403);

    const validRefererRes = await app.handle(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
        headers: { referer: "http://localhost:3000/dashboard" },
      }),
    );
    // Passes CSRF and hits requireAuth -> 401 instead of 403
    expect(validRefererRes.status).toBe(401);

    const nonBrowserClientRes = await app.handle(
      new Request("http://localhost/api/v1/auth/logout", {
        method: "POST",
      }),
    );
    // Absent both Origin & Referer passes CSRF and hits requireAuth -> 401
    expect(nonBrowserClientRes.status).toBe(401);
  });

  test("mounts Swagger/OpenAPI only when ENABLE_SWAGGER=true", async () => {
    const devApp = createApp({ env: createTestEnv({ ENABLE_SWAGGER: true }) });
    const uiRes = await devApp.handle(new Request("http://localhost/docs"));
    expect(uiRes.status).toBe(200);
    expect(uiRes.headers.get("content-type")).toContain("text/html");

    const specRes = await devApp.handle(
      new Request("http://localhost/docs/json"),
    );
    expect(specRes.status).toBe(200);
    const spec = (await specRes.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components?: { securitySchemes?: Record<string, unknown> };
    };
    expect(spec.openapi.startsWith("3.")).toBe(true);
    expect(spec.paths["/api/v1/auth/login"]).toBeDefined();
    expect(spec.paths["/api/v1/auth/me"]).toBeDefined();
    expect(spec.paths["/api/v1/auth/logout"]).toBeDefined();
    expect(spec.components?.securitySchemes?.cookieAuth).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "ims_session",
      description: "HttpOnly session cookie yang diterbitkan saat login",
    });

    const prodApp = createApp({
      env: createTestEnv({ NODE_ENV: "production", ENABLE_SWAGGER: false }),
    });
    const prodUiRes = await prodApp.handle(
      new Request("http://localhost/docs"),
    );
    expect(prodUiRes.status).toBe(404);
    const prodSpecRes = await prodApp.handle(
      new Request("http://localhost/docs/json"),
    );
    expect(prodSpecRes.status).toBe(404);
  });
});
