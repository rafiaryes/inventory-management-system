import { Elysia } from "elysia";
import { checkDatabaseHealth } from "./db";

export interface AppDependencies {
  checkDbHealth?: () => Promise<boolean>;
}

/**
 * Creates the base Elysia application instance for the backend.
 */
export function createApp(deps: AppDependencies = {}) {
  const probeDatabase = deps.checkDbHealth ?? checkDatabaseHealth;

  return new Elysia()
    .get("/health", () => ({
      status: "ok",
    }))
    .get("/health/db", async ({ set }) => {
      const connected = await probeDatabase();

      if (!connected) {
        set.status = 503;
        return {
          status: "error",
          database: "disconnected",
        };
      }

      return {
        status: "ok",
        database: "connected",
      };
    });
}

export type App = ReturnType<typeof createApp>;
