import { Elysia } from "elysia";
import { ForbiddenError } from "../common/errors";

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function extractValidHttpOrigin(rawHeaderValue: string): string | null {
  const trimmed = rawHeaderValue.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmed);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }
    return parsedUrl.origin;
  } catch {
    return null;
  }
}

/**
 * Validates `Origin` (or fallback `Referer`) headers against the allowlist on state-changing requests.
 */
export function createCsrfPlugin(allowedOrigins: readonly string[]) {
  const allowedOriginSet = new Set(allowedOrigins);

  return new Elysia({ name: "csrf-origin-check" }).onRequest(({ request }) => {
    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
      return;
    }

    const originHeader = request.headers.get("origin");
    if (originHeader !== null) {
      const parsedOrigin = extractValidHttpOrigin(originHeader);
      if (!parsedOrigin || !allowedOriginSet.has(parsedOrigin)) {
        throw new ForbiddenError("Origin permintaan tidak diizinkan");
      }
      return;
    }

    const refererHeader = request.headers.get("referer");
    if (refererHeader !== null) {
      const parsedRefererOrigin = extractValidHttpOrigin(refererHeader);
      if (!parsedRefererOrigin || !allowedOriginSet.has(parsedRefererOrigin)) {
        throw new ForbiddenError("Referer permintaan tidak diizinkan");
      }
    }
  });
}
