import { afterAll } from "bun:test";

export const BLOCKED_TEST_DB_URL =
  "postgresql://blocked:blocked@127.0.0.1:1/database_url_test_not_configured";

export function parsePgDatabaseName(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return null;
    }
    return parsed.pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
}

export function validateIsolatedTestDatabaseUrl(
  rawTestUrl: string | undefined,
  appDatabaseUrl?: string,
): string | null {
  const trimmedTestUrl = rawTestUrl?.trim();
  if (!trimmedTestUrl) {
    return null;
  }

  const testDbName = parsePgDatabaseName(trimmedTestUrl);
  if (!testDbName) {
    throw new Error(
      "DATABASE_URL_TEST must be a valid PostgreSQL connection string with a database name",
    );
  }

  if (testDbName === "inventory_management" || !testDbName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against non-test database "${testDbName}". Use a dedicated *_test database.`,
    );
  }

  const appDbName = parsePgDatabaseName(appDatabaseUrl);
  if (appDbName && !appDbName.endsWith("_test") && testDbName === appDbName) {
    throw new Error(
      `DATABASE_URL_TEST database "${testDbName}" must differ from application DATABASE_URL.`,
    );
  }

  return trimmedTestUrl;
}

export function getIsolatedTestDatabaseUrl(): string {
  return (
    validateIsolatedTestDatabaseUrl(process.env.DATABASE_URL_TEST) ??
    BLOCKED_TEST_DB_URL
  );
}

const SETUP_SYMBOL = Symbol.for("ims.test.db_isolation_initialized");
const globalState = globalThis as Record<symbol, boolean | undefined>;

function configureIsolatedTestDatabase(): void {
  const validated = validateIsolatedTestDatabaseUrl(
    process.env.DATABASE_URL_TEST,
    process.env.DATABASE_URL,
  );

  if (!validated) {
    // Prevent Bun auto-loaded .env DATABASE_URL (application DB) from ever being
    // queried when DATABASE_URL_TEST is not explicitly configured.
    process.env.DATABASE_URL = BLOCKED_TEST_DB_URL;
    return;
  }

  process.env.DATABASE_URL = validated;
}

if (!globalState[SETUP_SYMBOL]) {
  globalState[SETUP_SYMBOL] = true;
  configureIsolatedTestDatabase();

  afterAll(async () => {
    if (!process.env.DATABASE_URL_TEST?.trim()) {
      return;
    }
    const { closeDatabase } = await import("../src/db");
    await closeDatabase();
  });
}
