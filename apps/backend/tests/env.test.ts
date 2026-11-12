import { describe, expect, test } from "bun:test";
import { parseEnv } from "../src/config/env";

const VALID_DATABASE_URL = "postgresql://postgres:secret@localhost:5432/ims";

describe("parseEnv", () => {
  test("parses valid environment variables with development defaults", () => {
    const parsed = parseEnv({
      DATABASE_URL: VALID_DATABASE_URL,
    });

    expect(parsed).toEqual({
      NODE_ENV: "development",
      PORT: 3001,
      DATABASE_URL: VALID_DATABASE_URL,
      BUSINESS_TIMEZONE: "Asia/Jakarta",
      CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
      SESSION_COOKIE_NAME: "ims_session",
      SESSION_TTL_DAYS: 7,
      COOKIE_SECURE: false,
      COOKIE_SAME_SITE: "lax",
      LOGIN_RATE_LIMIT_MAX: 10,
      LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
      ENABLE_SWAGGER: true,
    });
  });

  test("applies secure production defaults when NODE_ENV=production", () => {
    const parsed = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: VALID_DATABASE_URL,
      CORS_ALLOWED_ORIGINS: "https://ims.example.com, https://admin.example.com",
    });

    expect(parsed.COOKIE_SECURE).toBe(true);
    expect(parsed.ENABLE_SWAGGER).toBe(false);
    expect(parsed.CORS_ALLOWED_ORIGINS).toEqual([
      "https://ims.example.com",
      "https://admin.example.com",
    ]);
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
        DATABASE_URL: VALID_DATABASE_URL,
        PORT: "70000",
      }),
    ).toThrow("Invalid PORT");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        NODE_ENV: "staging",
      }),
    ).toThrow("Invalid NODE_ENV");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        BUSINESS_TIMEZONE: "Invalid/Zone_Name",
      }),
    ).toThrow("Invalid BUSINESS_TIMEZONE");
  });

  test("rejects wildcard or malformed CORS_ALLOWED_ORIGINS", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        CORS_ALLOWED_ORIGINS: "*",
      }),
    ).toThrow("wildcard");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        CORS_ALLOWED_ORIGINS: "http://localhost:3000/",
      }),
    ).toThrow("Invalid CORS_ALLOWED_ORIGINS");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        CORS_ALLOWED_ORIGINS: "   ",
      }),
    ).toThrow("cannot be empty");
  });

  test("rejects invalid session, cookie, rate-limit, and swagger settings", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        SESSION_COOKIE_NAME: "bad cookie name",
      }),
    ).toThrow("Invalid SESSION_COOKIE_NAME");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        SESSION_TTL_DAYS: "0",
      }),
    ).toThrow("Invalid SESSION_TTL_DAYS");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        COOKIE_SAME_SITE: "none",
        COOKIE_SECURE: "false",
      }),
    ).toThrow("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        LOGIN_RATE_LIMIT_MAX: "-1",
      }),
    ).toThrow("Invalid LOGIN_RATE_LIMIT_MAX");

    expect(() =>
      parseEnv({
        DATABASE_URL: VALID_DATABASE_URL,
        ENABLE_SWAGGER: "yes",
      }),
    ).toThrow("Invalid ENABLE_SWAGGER");
  });
});
