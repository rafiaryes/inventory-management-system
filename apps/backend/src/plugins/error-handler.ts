import { Elysia, ValidationError as ElysiaValidationError } from "elysia";
import { AppError, type ErrorDetail } from "../common/errors";
import { errorResponse } from "../common/http";
import { formatUnexpectedErrorForLog } from "../common/security";
import { getRequestId } from "./request-id";

function normalizeFieldPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  const normalized = path.replace(/^\/+/, "").replace(/\//g, ".");
  return normalized.length > 0 ? normalized : undefined;
}

function extractValidationDetails(error: unknown): ErrorDetail[] {
  if (!(error instanceof ElysiaValidationError)) {
    return [{ message: "Permintaan tidak valid" }];
  }

  const seen = new Set<string>();
  const details: ErrorDetail[] = [];

  for (const item of error.all) {
    const field = normalizeFieldPath(item.path);
    const rawMessage =
      typeof item.summary === "string" && item.summary.trim().length > 0
        ? item.summary.trim()
        : item.message.trim();
    const message = rawMessage || "Nilai field tidak valid";
    const dedupeKey = `${field ?? ""}::${message}`;

    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    details.push(field ? { field, message } : { message });
  }

  return details.length > 0 ? details : [{ message: "Permintaan tidak valid" }];
}

/**
 * Global error handler mapping domain and Elysia errors to standardized API envelopes.
 */
export const errorHandlerPlugin = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, set, request }) => {
    const requestId = getRequestId(request, set);

    if (error instanceof AppError) {
      set.status = error.status;
      if (error.headers) {
        for (const [headerName, headerValue] of Object.entries(error.headers)) {
          set.headers[headerName] = headerValue;
        }
      }

      return errorResponse(
        error.code,
        error.message,
        error.details,
        requestId,
      );
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return errorResponse(
        "VALIDATION_ERROR",
        "Validasi permintaan gagal",
        extractValidationDetails(error),
        requestId,
      );
    }

    if (code === "PARSE") {
      set.status = 400;
      return errorResponse(
        "VALIDATION_ERROR",
        "Format JSON permintaan tidak valid",
        [{ message: "Body permintaan harus berupa JSON yang valid" }],
        requestId,
      );
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return errorResponse(
        "RESOURCE_NOT_FOUND",
        "Endpoint tidak ditemukan",
        [],
        requestId,
      );
    }

    if (code === "INVALID_COOKIE_SIGNATURE") {
      set.status = 401;
      return errorResponse(
        "UNAUTHENTICATED",
        "Autentikasi diperlukan atau sesi tidak valid",
        [],
        requestId,
      );
    }

    const safeError = formatUnexpectedErrorForLog(error);
    console.error(
      `[unexpected-error] requestId=${requestId} name=${safeError.name} message=${safeError.message}`,
    );

    set.status = 500;
    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      "Terjadi kesalahan internal pada server",
      [],
      requestId,
    );
  },
);
