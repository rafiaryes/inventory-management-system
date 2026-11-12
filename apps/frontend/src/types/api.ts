export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE_VIOLATION"
  | "INSUFFICIENT_STOCK"
  | "INACTIVE_PRODUCT"
  | "INACTIVE_CATEGORY"
  | "INVALID_UNIT_QUANTITY"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE";

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
