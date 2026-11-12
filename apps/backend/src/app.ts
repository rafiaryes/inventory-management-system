import { Elysia } from "elysia";

/**
 * Creates the base Elysia application instance for the backend.
 */
export function createApp() {
  return new Elysia().get("/health", () => ({
    status: "ok",
  }));
}

export type App = ReturnType<typeof createApp>;
