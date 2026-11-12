import type { ApiErrorDetail, ApiErrorResponse } from "@/types/api";
import { frontendEnv } from "./env";

export type QueryParamValue = string | number | boolean | undefined | null;

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, QueryParamValue>;
  body?: unknown;
  signal?: AbortSignal;
  skipUnauthorizedHandler?: boolean;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * Registers a callback invoked when an authenticated API call returns `401 Unauthorized`.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function buildRequestUrl(
  path: string,
  query?: Record<string, QueryParamValue>,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${frontendEnv.apiBaseUrl}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function parseRetryAfterHeader(rawHeader: string | null): number | undefined {
  if (!rawHeader) {
    return undefined;
  }
  const seconds = Number(rawHeader.trim());
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : undefined;
}

function generateRequestId(): string | undefined {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `fe-${crypto.randomUUID()}`;
  }
  return undefined;
}

/**
 * Executes a single non-retried HTTP request against the IMS backend with HttpOnly session cookies.
 */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const method = options.method ?? "GET";
  const url = buildRequestUrl(path, options.query);
  const headers = new Headers({
    Accept: "application/json",
  });

  const requestId = generateRequestId();
  if (requestId) {
    headers.set("X-Request-ID", requestId);
  }

  let bodyPayload: string | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    bodyPayload = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: bodyPayload,
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiClientError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Tidak dapat terhubung ke server API. Periksa koneksi atau status backend.",
      requestId,
    });
  }

  const responseRequestId =
    response.headers.get("X-Request-ID") ?? requestId ?? undefined;
  const retryAfterSeconds = parseRetryAfterHeader(
    response.headers.get("Retry-After"),
  );

  let parsedBody: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      !options.skipUnauthorizedHandler &&
      unauthorizedHandler
    ) {
      unauthorizedHandler();
    }

    const errorPayload =
      parsedBody && typeof parsedBody === "object" && "error" in parsedBody
        ? (parsedBody as ApiErrorResponse).error
        : undefined;

    throw new ApiClientError({
      status: response.status,
      code: errorPayload?.code ?? "HTTP_ERROR",
      message:
        errorPayload?.message ??
        `Permintaan gagal dengan status HTTP ${response.status}.`,
      details: errorPayload?.details,
      requestId: errorPayload?.requestId ?? responseRequestId,
      retryAfterSeconds,
    });
  }

  return parsedBody as TResponse;
}
