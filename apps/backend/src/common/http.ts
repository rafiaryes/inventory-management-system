import { t, type TSchema } from "elysia";
import type { ErrorCode, ErrorDetail } from "./errors";

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  message: string;
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
    requestId: string;
  };
}

/**
 * Wraps a single payload in the standardized API success envelope.
 */
export function successResponse<T>(
  message: string,
  data: T,
): ApiSuccessResponse<T> {
  return {
    success: true,
    message,
    data,
  };
}

/**
 * Wraps a list payload and pagination metadata in the standardized API envelope.
 */
export function paginatedResponse<T>(
  message: string,
  data: T[],
  meta: PaginationMeta,
): ApiPaginatedResponse<T> {
  return {
    success: true,
    message,
    data,
    meta,
  };
}

/**
 * Formats an error payload into the standardized API error envelope.
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details: ErrorDetail[],
  requestId: string,
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      requestId,
    },
  };
}

export const errorDetailSchema = t.Object({
  field: t.Optional(t.String()),
  message: t.String(),
});

export const errorEnvelopeSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(errorDetailSchema),
    requestId: t.String(),
  }),
});

/**
 * Builds an OpenAPI-compatible TypeBox schema for a standard success response.
 */
export function createSuccessSchema<T extends TSchema>(dataSchema: T) {
  return t.Object({
    success: t.Literal(true),
    message: t.String(),
    data: dataSchema,
  });
}
