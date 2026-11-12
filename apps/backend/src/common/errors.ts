export const ERROR_CODES = [
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

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  field?: string;
  message: string;
}

export interface AppErrorOptions {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  headers?: Record<string, string>;
}

/**
 * Base application error mapped cleanly to the standardized API error envelope.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];
  readonly headers?: Record<string, string>;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
    this.headers = options.headers;
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Data permintaan tidak valid",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 400,
      code: "VALIDATION_ERROR",
      message,
      details,
    });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(
    message = "Autentikasi diperlukan atau sesi tidak valid",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 401,
      code: "UNAUTHENTICATED",
      message,
      details,
    });
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(
    message = "Email atau kata sandi salah",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message,
      details,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "Anda tidak memiliki akses untuk melakukan tindakan ini",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 403,
      code: "FORBIDDEN",
      message,
      details,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "Resource tidak ditemukan",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      message,
      details,
    });
  }
}

export type ConflictErrorCode =
  | "STATE_CONFLICT"
  | "DUPLICATE_EMAIL"
  | "DUPLICATE_SKU"
  | "DUPLICATE_CATEGORY_NAME";

export class ConflictError extends AppError {
  constructor(
    message: string,
    code: ConflictErrorCode = "STATE_CONFLICT",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 409,
      code,
      message,
      details,
    });
  }
}

export type BusinessRuleErrorCode =
  | "BUSINESS_RULE_VIOLATION"
  | "INSUFFICIENT_STOCK"
  | "INACTIVE_PRODUCT"
  | "INACTIVE_CATEGORY"
  | "INVALID_UNIT_QUANTITY";

export class BusinessRuleError extends AppError {
  constructor(
    message: string,
    code: BusinessRuleErrorCode = "BUSINESS_RULE_VIOLATION",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 422,
      code,
      message,
      details,
    });
  }
}

export class RateLimitExceededError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(
    retryAfterSeconds: number,
    message = "Terlalu banyak percobaan login. Silakan coba lagi nanti",
    details: ErrorDetail[] = [],
  ) {
    const normalizedRetryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
    super({
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      message,
      details,
      headers: {
        "retry-after": String(normalizedRetryAfter),
      },
    });
    this.retryAfterSeconds = normalizedRetryAfter;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message = "Layanan sedang tidak tersedia",
    details: ErrorDetail[] = [],
  ) {
    super({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message,
      details,
    });
  }
}
