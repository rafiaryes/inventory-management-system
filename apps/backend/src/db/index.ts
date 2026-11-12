import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../config/env";
import * as schema from "./schema";

const env = getEnv();

const BLOCKED_TEST_DB_NAME = "database_url_test_not_configured";

/**
 * Ensures test-mode database initialization never targets the application database.
 */
export function assertSafeTestDatabaseUrl(databaseUrl: string): void {
  let dbName = "";
  try {
    dbName = new URL(databaseUrl).pathname.replace(/^\//, "");
  } catch {
    throw new Error("Invalid DATABASE_URL in test mode");
  }

  if (
    dbName === "inventory_management" ||
    (!dbName.endsWith("_test") && dbName !== BLOCKED_TEST_DB_NAME)
  ) {
    throw new Error(
      `Refusing to initialize PostgreSQL connection in test mode against non-test database "${dbName || "<empty>"}". Set DATABASE_URL_TEST to a dedicated *_test database.`,
    );
  }
}

if (env.NODE_ENV === "test") {
  assertSafeTestDatabaseUrl(env.DATABASE_URL);
}

export const sqlClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: {
    TimeZone: "UTC",
  },
});

export const db = drizzle(sqlClient, { schema });

export type Database = typeof db;

/**
 * Verifies database connectivity using a lightweight query.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error(
      "Database health check failed:",
      error instanceof Error ? error.message : "Unknown database error",
    );
    return false;
  }
}

/**
 * Gracefully closes the underlying PostgreSQL connection pool.
 */
export async function closeDatabase(): Promise<void> {
  await sqlClient.end({ timeout: 5 });
}
