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
  if (pg.code !== "23505") {
    return false;
  }

  if (constraintName && pg.constraint) {
    return pg.constraint === constraintName;
  }

  return true;
}
