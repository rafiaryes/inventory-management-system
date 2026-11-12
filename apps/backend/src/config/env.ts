export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export interface BackendEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL: string;
  BUSINESS_TIMEZONE: string;
}

const DEFAULT_PORT = 3001;
const DEFAULT_BUSINESS_TIMEZONE = "Asia/Jakarta";

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses and validates backend startup environment variables.
 */
export function parseEnv(
  raw: Record<string, string | undefined> = process.env,
): BackendEnv {
  const rawNodeEnv = raw.NODE_ENV?.trim() || "development";
  if (!NODE_ENVS.includes(rawNodeEnv as NodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${rawNodeEnv}". Expected one of: ${NODE_ENVS.join(", ")}`,
    );
  }
  const nodeEnv = rawNodeEnv as NodeEnv;

  const rawPort = raw.PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT environment variable: "${raw.PORT}"`);
  }

  const databaseUrl = raw.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  if (
    !databaseUrl.startsWith("postgres://") &&
    !databaseUrl.startsWith("postgresql://")
  ) {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL connection string (postgres:// or postgresql://)",
    );
  }

  const businessTimezone =
    raw.BUSINESS_TIMEZONE?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  if (!isValidTimeZone(businessTimezone)) {
    throw new Error(
      `Invalid BUSINESS_TIMEZONE environment variable: "${businessTimezone}"`,
    );
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    BUSINESS_TIMEZONE: businessTimezone,
  };
}

let cachedEnv: BackendEnv | null = null;

/**
 * Returns validated backend environment configuration (cached per process).
 */
export function getEnv(): BackendEnv {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
}
