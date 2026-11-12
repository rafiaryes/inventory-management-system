import { describe, expect, test } from "bun:test";
import { parseEnv } from "../src/config/env";

describe("parseEnv", () => {
  test("parses valid environment variables with defaults", () => {
    const parsed = parseEnv({
      DATABASE_URL: "postgresql://postgres:secret@localhost:5432/ims",
    });

    expect(parsed).toEqual({
      NODE_ENV: "development",
      PORT: 3001,
      DATABASE_URL: "postgresql://postgres:secret@localhost:5432/ims",
      BUSINESS_TIMEZONE: "Asia/Jakarta",
    });
  });

  test("rejects missing or non-postgresql DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow("DATABASE_URL");
    expect(() =>
      parseEnv({ DATABASE_URL: "mysql://user:pass@localhost:3306/ims" }),
    ).toThrow("PostgreSQL connection string");
  });

  test("rejects invalid PORT, NODE_ENV, or BUSINESS_TIMEZONE", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:secret@localhost:5432/ims",
        PORT: "70000",
      }),
    ).toThrow("Invalid PORT");

    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:secret@localhost:5432/ims",
        NODE_ENV: "staging",
      }),
    ).toThrow("Invalid NODE_ENV");

    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:secret@localhost:5432/ims",
        BUSINESS_TIMEZONE: "Invalid/Zone_Name",
      }),
    ).toThrow("Invalid BUSINESS_TIMEZONE");
  });
});
