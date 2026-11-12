import { defineConfig } from "drizzle-kit";

function resolveDatabaseUrl(): string {
  if (process.env.DRIZZLE_USE_TEST_DB === "true") {
    const testUrl = process.env.DATABASE_URL_TEST?.trim();
    if (!testUrl) {
      throw new Error(
        "DATABASE_URL_TEST must be set when DRIZZLE_USE_TEST_DB=true",
      );
    }

    const parsed = new URL(testUrl);
    const dbName = parsed.pathname.replace(/^\//, "");
    const appDbRaw = process.env.DATABASE_URL?.trim();
    const appDbName = appDbRaw
      ? new URL(appDbRaw).pathname.replace(/^\//, "")
      : "";
    if (
      !dbName ||
      dbName === "inventory_management" ||
      !dbName.endsWith("_test") ||
      (appDbName && !appDbName.endsWith("_test") && dbName === appDbName)
    ) {
      throw new Error(
        `Refusing Drizzle test command on unsafe database "${dbName || "<empty>"}"`,
      );
    }

    return testUrl;
  }

  return process.env.DATABASE_URL ?? "";
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
