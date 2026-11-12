import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";

describe("operational health endpoints", () => {
  test("GET /health returns 200 ok", async () => {
    const app = createApp();
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("GET /health/db returns 200 connected against live PostgreSQL", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/health/db"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      database: "connected",
    });
  });

  test("GET /health/db returns 503 disconnected when database check fails", async () => {
    const app = createApp({
      checkDbHealth: async () => false,
    });
    const response = await app.handle(
      new Request("http://localhost/health/db"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      database: "disconnected",
    });
  });
});
