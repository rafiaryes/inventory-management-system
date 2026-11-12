import { parseTrustedProxyCidr } from "../common/security";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const COOKIE_SAME_SITE_VALUES = ["lax", "strict", "none"] as const;
export type CookieSameSite = (typeof COOKIE_SAME_SITE_VALUES)[number];

export interface BackendEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL: string;
  BUSINESS_TIMEZONE: string;
  CORS_ALLOWED_ORIGINS: string[];
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_DAYS: number;
  COOKIE_SECURE: boolean;
  COOKIE_SAME_SITE: CookieSameSite;
  TRUSTED_PROXY_IPS: string[];
  LOGIN_RATE_LIMIT_MAX: number;
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: number;
  ENABLE_SWAGGER: boolean;
}

const DEFAULT_PORT = 3001;
const DEFAULT_BUSINESS_TIMEZONE = "Asia/Jakarta";
const DEFAULT_CORS_ALLOWED_ORIGINS = ["http://localhost:3000"];
const DEFAULT_SESSION_COOKIE_NAME = "ims_session";
const DEFAULT_SESSION_TTL_DAYS = 7;
const DEFAULT_COOKIE_SAME_SITE: CookieSameSite = "lax";
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 900;

const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parsePositiveInteger(
  rawValue: string | undefined,
  defaultValue: number,
  name: string,
  maxValue?: number,
): number {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return defaultValue;
  }

  const parsed = Number(trimmed);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    (maxValue !== undefined && parsed > maxValue)
  ) {
    throw new Error(`Invalid ${name} environment variable: "${rawValue}"`);
  }

  return parsed;
}

function parseBoolean(
  rawValue: string | undefined,
  defaultValue: boolean,
  name: string,
): boolean {
  const trimmed = rawValue?.trim().toLowerCase();
  if (!trimmed) {
    return defaultValue;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  throw new Error(
    `Invalid ${name} environment variable: "${rawValue}". Expected "true" or "false"`,
  );
}

function parseCorsAllowedOrigins(rawValue: string | undefined): string[] {
  if (rawValue === undefined) {
    return [...DEFAULT_CORS_ALLOWED_ORIGINS];
  }

  const trimmedRaw = rawValue.trim();
  if (!trimmedRaw) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS environment variable cannot be empty",
    );
  }

  const origins = trimmedRaw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS environment variable must list at least one origin",
    );
  }

  const uniqueOrigins = new Set<string>();
  for (const origin of origins) {
    if (origin === "*") {
      throw new Error(
        "CORS_ALLOWED_ORIGINS cannot contain wildcard '*' for credentialed requests",
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(origin);
    } catch {
      throw new Error(
        `Invalid CORS_ALLOWED_ORIGINS entry "${origin}": must be a valid HTTP(S) origin`,
      );
    }

    if (
      (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
      parsedUrl.origin !== origin
    ) {
      throw new Error(
        `Invalid CORS_ALLOWED_ORIGINS entry "${origin}": expected exact origin without trailing slash, path, or query (e.g. "${parsedUrl.origin}")`,
      );
    }

    uniqueOrigins.add(parsedUrl.origin);
  }

  return [...uniqueOrigins];
}

function parseTrustedProxyIps(rawValue: string | undefined): string[] {
  if (rawValue === undefined || rawValue.trim().length === 0) {
    return [];
  }

  const uniqueEntries = new Set<string>();
  for (const segment of rawValue.split(",")) {
    const parsedRule = parseTrustedProxyCidr(segment);
    uniqueEntries.add(parsedRule.raw);
  }
  return [...uniqueEntries];
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

  const port = parsePositiveInteger(raw.PORT, DEFAULT_PORT, "PORT", 65535);

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

  const corsAllowedOrigins = parseCorsAllowedOrigins(raw.CORS_ALLOWED_ORIGINS);

  const sessionCookieName =
    raw.SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE_NAME;
  if (!COOKIE_NAME_PATTERN.test(sessionCookieName)) {
    throw new Error(
      `Invalid SESSION_COOKIE_NAME environment variable: "${sessionCookieName}"`,
    );
  }

  const sessionTtlDays = parsePositiveInteger(
    raw.SESSION_TTL_DAYS,
    DEFAULT_SESSION_TTL_DAYS,
    "SESSION_TTL_DAYS",
  );

  const cookieSecure = parseBoolean(
    raw.COOKIE_SECURE,
    nodeEnv === "production",
    "COOKIE_SECURE",
  );

  const rawSameSite =
    raw.COOKIE_SAME_SITE?.trim().toLowerCase() || DEFAULT_COOKIE_SAME_SITE;
  if (!COOKIE_SAME_SITE_VALUES.includes(rawSameSite as CookieSameSite)) {
    throw new Error(
      `Invalid COOKIE_SAME_SITE "${rawSameSite}". Expected one of: ${COOKIE_SAME_SITE_VALUES.join(", ")}`,
    );
  }
  const cookieSameSite = rawSameSite as CookieSameSite;

  if (cookieSameSite === "none" && !cookieSecure) {
    throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
  }

  const trustedProxyIps = parseTrustedProxyIps(raw.TRUSTED_PROXY_IPS);

  const loginRateLimitMax = parsePositiveInteger(
    raw.LOGIN_RATE_LIMIT_MAX,
    DEFAULT_LOGIN_RATE_LIMIT_MAX,
    "LOGIN_RATE_LIMIT_MAX",
  );

  const loginRateLimitWindowSeconds = parsePositiveInteger(
    raw.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    "LOGIN_RATE_LIMIT_WINDOW_SECONDS",
  );

  const enableSwagger = parseBoolean(
    raw.ENABLE_SWAGGER,
    nodeEnv === "development",
    "ENABLE_SWAGGER",
  );

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    BUSINESS_TIMEZONE: businessTimezone,
    CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    SESSION_COOKIE_NAME: sessionCookieName,
    SESSION_TTL_DAYS: sessionTtlDays,
    COOKIE_SECURE: cookieSecure,
    COOKIE_SAME_SITE: cookieSameSite,
    TRUSTED_PROXY_IPS: trustedProxyIps,
    LOGIN_RATE_LIMIT_MAX: loginRateLimitMax,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: loginRateLimitWindowSeconds,
    ENABLE_SWAGGER: enableSwagger,
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
