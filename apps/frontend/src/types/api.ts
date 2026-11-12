export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "RESOURCE_NOT_FOUND",
  "DUPLICATE_EMAIL",
  "DUPLICATE_SKU",
  "DUPLICATE_CATEGORY_NAME",
  "STATE_CONFLICT",
  "BUSINESS_RULE_VIOLATION",
  "INSUFFICIENT_STOCK",
  "INACTIVE_PRODUCT",
  "INACTIVE_CATEGORY",
  "INVALID_UNIT_QUANTITY",
  "RATE_LIMIT_EXCEEDED",
  "INTERNAL_SERVER_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
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
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
}
