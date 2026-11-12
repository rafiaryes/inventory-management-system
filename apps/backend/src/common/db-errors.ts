export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  DEADLOCK_DETECTED: "40P01",
} as const;

export interface PgErrorDetails {
  code?: string;
  constraint?: string;
}

interface RawPgErrorShape {
  code?: unknown;
  constraint?: unknown;
  constraint_name?: unknown;
  cause?: unknown;
}

function readDirectPgShape(value: unknown): PgErrorDetails {
  if (!value || typeof value !== "object") {
    return {};
  }

  const shape = value as RawPgErrorShape;
  const code = typeof shape.code === "string" ? shape.code : undefined;
  const constraint =
    typeof shape.constraint === "string"
      ? shape.constraint
      : typeof shape.constraint_name === "string"
        ? shape.constraint_name
        : undefined;

  return { code, constraint };
}

/**
 * Safely extracts PostgreSQL SQLSTATE code and constraint name from Drizzle/Postgres.js errors.
 */
export function extractPgError(error: unknown): PgErrorDetails {
  const direct = readDirectPgShape(error);
  if (direct.code) {
    return direct;
  }

  if (error && typeof error === "object" && "cause" in error) {
    return readDirectPgShape((error as RawPgErrorShape).cause);
  }

  return {};
}

/**
 * Returns true if the error represents a PostgreSQL unique constraint violation (`23505`).
 */
export function isUniqueViolation(
  error: unknown,
  constraintName?: string,
): boolean {
  const pg = extractPgError(error);
  if (pg.code !== PG_ERROR_CODES.UNIQUE_VIOLATION) {
    return false;
  }

  if (constraintName && pg.constraint) {
    return pg.constraint === constraintName;
  }

  return true;
}

/**
 * Returns true if the error represents a PostgreSQL transaction deadlock (`40P01`).
 *
 * Deadlocks are NOT blindly mapped globally to HTTP `409 STATE_CONFLICT` because `40P01`
 * indicates a lock-ordering or transient serialization failure across transactions rather
 * than a deterministic domain state conflict; callers should prevent deadlocks via
 * consistent lock ordering (e.g., `pg_advisory_xact_lock`) instead of masking them.
 */
export function isDeadlockDetected(error: unknown): boolean {
  return extractPgError(error).code === PG_ERROR_CODES.DEADLOCK_DETECTED;
}
