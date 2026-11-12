import { cors } from "@elysiajs/cors";

/**
 * Configures CORS with an explicit origin allowlist and credentials support.
 */
export function createCorsPlugin(allowedOrigins: readonly string[]) {
  const allowedOriginSet = new Set(allowedOrigins);

  return cors({
    origin: (request: Request) => {
      const requestOrigin = request.headers.get("origin");
      return requestOrigin !== null && allowedOriginSet.has(requestOrigin);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "X-Request-ID"],
    exposeHeaders: ["X-Request-ID", "Retry-After"],
    maxAge: 600,
  });
}
