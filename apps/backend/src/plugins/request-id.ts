import { Elysia } from "elysia";

export const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const requestIds = new WeakMap<Request, string>();

/**
 * Resolves or generates a consistent request identifier for a Request instance.
 */
export function resolveRequestId(request: Request): string {
  const existing = requestIds.get(request);
  if (existing) {
    return existing;
  }

  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim();
  const resolved =
    incoming && SAFE_REQUEST_ID_PATTERN.test(incoming)
      ? incoming
      : crypto.randomUUID();

  requestIds.set(request, resolved);
  return resolved;
}

/**
 * Ensures `X-Request-ID` is attached to response headers and returns the request identifier.
 */
export function getRequestId(
  request: Request,
  set?: { headers?: Record<string, string | number | undefined> },
): string {
  const requestId = resolveRequestId(request);
  if (set?.headers) {
    set.headers[REQUEST_ID_HEADER] = requestId;
  }
  return requestId;
}

/**
 * Propagates or generates `X-Request-ID` early in the request lifecycle.
 */
export const requestIdPlugin = new Elysia({ name: "request-id" })
  .onRequest(({ request, set }) => {
    getRequestId(request, set);
  })
  .derive({ as: "global" }, ({ request, set }) => ({
    requestId: getRequestId(request, set),
  }));
