import { ValidationError } from "./errors";
import type { PaginationMeta } from "./http";

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

const POSITIVE_INT_PATTERN = /^\d+$/;

export interface BaseListQuery {
  page: number;
  pageSize: number;
  search?: string;
  sortOrder: SortOrder;
}

/**
 * Parses an integer query parameter with explicit bounds checking (`400 VALIDATION_ERROR`).
 */
export function parseBoundedIntegerParam(
  rawValue: string | undefined,
  options: {
    field: string;
    defaultValue: number;
    min: number;
    max?: number;
  },
): number {
  if (rawValue === undefined) {
    return options.defaultValue;
  }

  const trimmed = rawValue.trim();
  if (!trimmed || !POSITIVE_INT_PATTERN.test(trimmed)) {
    throw new ValidationError("Parameter query tidak valid", [
      {
        field: options.field,
        message: `${options.field} harus berupa bilangan bulat`,
      },
    ]);
  }

  const parsed = Number(trimmed);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < options.min ||
    (options.max !== undefined && parsed > options.max)
  ) {
    const rangeText =
      options.max !== undefined
        ? `${options.min} sampai ${options.max}`
        : `>= ${options.min}`;
    throw new ValidationError("Parameter query di luar batas", [
      {
        field: options.field,
        message: `${options.field} harus bernilai antara ${rangeText}`,
      },
    ]);
  }

  return parsed;
}

/**
 * Parses a boolean query string (`"true"` or `"false"`) strictly.
 */
export function parseBooleanParam(
  rawValue: string | undefined,
  field: string,
): boolean | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new ValidationError("Parameter boolean tidak valid", [
    {
      field,
      message: `${field} harus bernilai 'true' atau 'false'`,
    },
  ]);
}

/**
 * Normalizes an optional search string (trimmed, empty becomes undefined).
 */
export function normalizeSearchTerm(
  rawValue: string | undefined,
): string | undefined {
  if (rawValue === undefined) {
    return undefined;
  }
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Escapes PostgreSQL LIKE/ILIKE wildcard characters in user search strings.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Parses `sortOrder` (`asc` | `desc`, defaults to `desc`).
 */
export function parseSortOrder(rawValue: string | undefined): SortOrder {
  if (rawValue === undefined) {
    return "desc";
  }
  if (rawValue === "asc" || rawValue === "desc") {
    return rawValue;
  }

  throw new ValidationError("Parameter urutan tidak valid", [
    {
      field: "sortOrder",
      message: "sortOrder harus bernilai 'asc' atau 'desc'",
    },
  ]);
}

/**
 * Parses common pagination, search, and sortOrder query parameters.
 */
export function parseBaseListQuery(raw: {
  page?: string;
  pageSize?: string;
  search?: string;
  sortOrder?: string;
}): BaseListQuery {
  return {
    page: parseBoundedIntegerParam(raw.page, {
      field: "page",
      defaultValue: DEFAULT_PAGE,
      min: 1,
    }),
    pageSize: parseBoundedIntegerParam(raw.pageSize, {
      field: "pageSize",
      defaultValue: DEFAULT_PAGE_SIZE,
      min: 1,
      max: MAX_PAGE_SIZE,
    }),
    search: normalizeSearchTerm(raw.search),
    sortOrder: parseSortOrder(raw.sortOrder),
  };
}

/**
 * Builds deterministic pagination metadata matching the API contract.
 */
export function buildPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PaginationMeta {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}
