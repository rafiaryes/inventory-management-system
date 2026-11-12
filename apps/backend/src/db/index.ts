import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../config/env";
import * as schema from "./schema";

const env = getEnv();

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
