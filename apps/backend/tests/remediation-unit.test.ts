import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { API_ERROR_CODES } from "../../frontend/src/types/api";
import { createApp } from "../src/app";
import {
  isDeadlockDetected,
  isUniqueViolation,
  PG_ERROR_CODES,
} from "../src/common/db-errors";
import { ERROR_CODES } from "../src/common/errors";
import {
  extractClientIp,
  isIpInTrustedProxies,
  parseTrustedProxyCidr,
} from "../src/common/security";
import type { BackendEnv } from "../src/config/env";
import type { Database } from "../src/db";
import { createLoginRateLimiter } from "../src/modules/auth/auth.rate-limiter";
import { createAuthRoutes } from "../src/modules/auth/auth.route";
import type { AuthService } from "../src/modules/auth/auth.service";
import { createCategoriesRoutes } from "../src/modules/categories/categories.route";
import type { CategoriesService } from "../src/modules/categories/categories.service";
import { createProductsRoutes } from "../src/modules/products/products.route";
import type { ProductsService } from "../src/modules/products/products.service";
import { createStockMovementsRoutes } from "../src/modules/stock-movements/stock-movements.route";
import type { StockMovementsService } from "../src/modules/stock-movements/stock-movements.service";
import { createUsersRepository } from "../src/modules/users/users.repository";
import { createUsersRoutes } from "../src/modules/users/users.route";
import type { UsersService } from "../src/modules/users/users.service";
import { createAuthPlugin } from "../src/plugins/auth";
import { errorHandlerPlugin } from "../src/plugins/error-handler";
import { requestIdPlugin } from "../src/plugins/request-id";

function createUnitTestEnv(overrides: Partial<BackendEnv> = {}): BackendEnv {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    DATABASE_URL:
      "postgresql://postgres:postgres@localhost:5432/inventory_management_unit",
    BUSINESS_TIMEZONE: "Asia/Jakarta",
    CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
    SESSION_COOKIE_NAME: "ims_session",
    SESSION_TTL_DAYS: 7,
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: "lax",
    TRUSTED_PROXY_IPS: [],
    LOGIN_RATE_LIMIT_MAX: 10,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
    ...overrides,
  };
}

describe("F-01: admin deadlock prevention and PostgreSQL error helpers", () => {
  test("detects PostgreSQL deadlock error code 40P01 directly and through .cause", () => {
    expect(PG_ERROR_CODES.DEADLOCK_DETECTED).toBe("40P01");
    expect(isDeadlockDetected({ code: "40P01" })).toBe(true);
    expect(
      isDeadlockDetected(
        new Error("Failed query", {
          cause: { code: "40P01", constraint: undefined },
        }),
      ),
    ).toBe(true);
    expect(isDeadlockDetected({ code: "23505" })).toBe(false);
    expect(isDeadlockDetected(null)).toBe(false);

    expect(
      isUniqueViolation(
        { code: "23505", constraint: "users_email_unique_idx" },
        "users_email_unique_idx",
      ),
    ).toBe(true);
    expect(isUniqueViolation({ code: "40P01" })).toBe(false);
  });

  function createMockTxRecorder() {
    const events: string[] = [];
    const now = new Date("2026-11-12T00:00:00.000Z");
    const adminRowA = {
      id: "00000000-0000-4000-8000-00000000000a",
      name: "Admin A",
      email: "admin-a@example.com",
      passwordHash: "hash-a",
      role: "admin" as const,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const adminRowB = {
      id: "00000000-0000-4000-8000-00000000000b",
      name: "Admin B",
      email: "admin-b@example.com",
      passwordHash: "hash-b",
      role: "admin" as const,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const tx = {
      execute(query: unknown) {
        const serialized = JSON.stringify(query);
        if (serialized.includes("pg_advisory_xact_lock")) {
          events.push("advisory_lock");
        } else {
          events.push("execute");
        }
        return Promise.resolve([]);
      },
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    events.push("select_limit");
                    return Promise.resolve([adminRowA]);
                  },
                  orderBy() {
                    events.push("order_by");
                    return {
                      for(mode: string) {
                        events.push(`select_for_${mode}`);
                        return Promise.resolve([adminRowA, adminRowB]);
                      },
                    };
                  },
                  for(mode: string) {
                    events.push(`select_for_${mode}`);
                    return Promise.resolve([adminRowA]);
                  },
                };
              },
            };
          },
        };
      },
      insert() {
        return {
          values() {
            return {
              returning() {
                events.push("insert");
                return Promise.resolve([adminRowA]);
              },
            };
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                events.push("update_no_returning");
                return {
                  returning() {
                    events.push("update_returning");
                    return Promise.resolve([
                      { ...adminRowA, role: "staff", isActive: false },
                    ]);
                  },
                };
              },
            };
          },
        };
      },
    };

    const db = {
      transaction: async <T>(fn: (txArg: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as Database;

    return { db, events, targetId: adminRowA.id };
  }

  test("acquires transaction advisory lock before row locks on admin-membership mutations", async () => {
    const createCase = createMockTxRecorder();
    const repoCreate = createUsersRepository(createCase.db);
    await repoCreate.create({
      name: "New Admin",
      email: "new-admin@example.com",
      passwordHash: "hash",
      role: "admin",
    });
    expect(createCase.events[0]).toBe("advisory_lock");

    const roleUpdateCase = createMockTxRecorder();
    const repoRole = createUsersRepository(roleUpdateCase.db);
    await repoRole.updateUserInTx({
      id: roleUpdateCase.targetId,
      actorUserId: "actor-id",
      changes: { role: "staff" },
    });
    const advisoryRoleIdx = roleUpdateCase.events.indexOf("advisory_lock");
    const firstLockIdx = roleUpdateCase.events.indexOf("select_for_update");
    expect(advisoryRoleIdx).toBe(0);
    expect(firstLockIdx).toBeGreaterThan(advisoryRoleIdx);
    expect(roleUpdateCase.events).toContain("order_by");

    const statusUpdateCase = createMockTxRecorder();
    const repoStatus = createUsersRepository(statusUpdateCase.db);
    await repoStatus.updateUserStatusInTx({
      id: statusUpdateCase.targetId,
      actorUserId: "actor-id",
      isActive: false,
      revokeSessions: async () => undefined,
    });
    const advisoryStatusIdx = statusUpdateCase.events.indexOf("advisory_lock");
    const statusLockIdx = statusUpdateCase.events.indexOf("select_for_update");
    expect(advisoryStatusIdx).toBe(0);
    expect(statusLockIdx).toBeGreaterThan(advisoryStatusIdx);
    expect(statusUpdateCase.events).toContain("order_by");

    const nameOnlyCase = createMockTxRecorder();
    const repoName = createUsersRepository(nameOnlyCase.db);
    await repoName.updateUserInTx({
      id: nameOnlyCase.targetId,
      actorUserId: "actor-id",
      changes: { name: "Renamed Admin" },
    });
    expect(nameOnlyCase.events).not.toContain("advisory_lock");
  });
});

describe("F-02: trusted proxy CIDR validation, right-to-left XFF, and flood-safe rate limiter", () => {
  test("parses IPv4, IPv6, IPv4-mapped IPv6, and CIDR ranges strictly", () => {
    const v4Exact = parseTrustedProxyCidr("127.0.0.1");
    expect(v4Exact.raw).toBe("127.0.0.1");
    expect(isIpInTrustedProxies("127.0.0.1", [v4Exact])).toBe(true);
    expect(isIpInTrustedProxies("127.0.0.2", [v4Exact])).toBe(false);

    const v4Mapped = parseTrustedProxyCidr("::ffff:10.1.2.3");
    expect(v4Mapped.raw).toBe("10.1.2.3");

    const v4Cidr = parseTrustedProxyCidr("10.0.0.0/8");
    expect(isIpInTrustedProxies("10.254.1.9", [v4Cidr])).toBe(true);
    expect(isIpInTrustedProxies("11.0.0.1", [v4Cidr])).toBe(false);

    const v6Cidr = parseTrustedProxyCidr("2001:db8::/32");
    expect(isIpInTrustedProxies("2001:db8:0:1::42", [v6Cidr])).toBe(true);
    expect(isIpInTrustedProxies("2001:db9::1", [v6Cidr])).toBe(false);

    const v6Loopback = parseTrustedProxyCidr("::1");
    expect(isIpInTrustedProxies("0:0:0:0:0:0:0:1", [v6Loopback])).toBe(true);

    expect(() => parseTrustedProxyCidr("")).toThrow();
    expect(() => parseTrustedProxyCidr("localhost")).toThrow();
    expect(() => parseTrustedProxyCidr("192.168.1.0/33")).toThrow();
    expect(() => parseTrustedProxyCidr("2001:db8::/129")).toThrow();
    expect(() => parseTrustedProxyCidr("10.0.0.0/abc")).toThrow();
  });

  test("direct connection without proxy and empty trusted proxy list ignore forwarded headers", () => {
    const req = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: {
        "x-forwarded-for": "198.51.100.55",
        "x-real-ip": "198.51.100.77",
      },
    });

    expect(extractClientIp(req, { socketIp: "192.0.2.10" })).toBe("192.0.2.10");
    expect(
      extractClientIp(req, {
        socketIp: "::ffff:192.0.2.10",
        trustedProxyIps: [],
      }),
    ).toBe("192.0.2.10");
  });

  test("peer in trusted IPv4/IPv6 CIDR trusts forwarded IP, while peer outside trusted CIDR ignores headers", () => {
    const trustedIpv4 = ["127.0.0.1", "10.0.0.0/8"];
    const reqV4 = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.45" },
    });
    expect(
      extractClientIp(reqV4, {
        socketIp: "10.24.5.6",
        trustedProxyIps: trustedIpv4,
      }),
    ).toBe("203.0.113.45");

    // Peer outside trusted CIDR cannot spoof XFF or X-Real-IP
    expect(
      extractClientIp(reqV4, {
        socketIp: "198.51.100.22",
        trustedProxyIps: trustedIpv4,
      }),
    ).toBe("198.51.100.22");

    // Trusted IPv6 peer
    const trustedIpv6 = ["fd00::/8", "::1"];
    const reqV6 = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "2001:db8::99" },
    });
    expect(
      extractClientIp(reqV6, {
        socketIp: "fd00:10::5",
        trustedProxyIps: trustedIpv6,
      }),
    ).toBe("2001:db8::99");
  });

  test("parses X-Forwarded-For right-to-left across multi-hop proxies and defeats leftmost spoofing/append", () => {
    const trusted = ["127.0.0.1", "10.0.0.0/8", "fc00::/7"];

    // Multi-hop: client -> edge (10.0.1.5) -> internal (10.0.2.8) -> socket peer (127.0.0.1)
    const multiHopReq = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.88, 10.0.1.5, 10.0.2.8" },
    });
    expect(
      extractClientIp(multiHopReq, {
        socketIp: "127.0.0.1",
        trustedProxyIps: trusted,
      }),
    ).toBe("198.51.100.88");

    // Reverse proxy append: attacker injected fake leftmost IP "1.2.3.4", proxy appended real IP "203.0.113.77"
    const appendSpoofReq1 = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.77, 10.1.2.3" },
    });
    const appendSpoofReq2 = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "8.8.8.8, 203.0.113.77, 10.1.2.3" },
    });
    const extracted1 = extractClientIp(appendSpoofReq1, {
      socketIp: "127.0.0.1",
      trustedProxyIps: trusted,
    });
    const extracted2 = extractClientIp(appendSpoofReq2, {
      socketIp: "127.0.0.1",
      trustedProxyIps: trusted,
    });
    expect(extracted1).toBe("203.0.113.77");
    expect(extracted2).toBe("203.0.113.77");
  });

  test("handles malformed X-Forwarded-For and X-Real-IP safely without trusting spoofed left hops", () => {
    const trusted = ["127.0.0.1"];

    // Malformed rightmost hop must fall back to verified peerIp instead of trusting left value
    const malformedRightReq = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.5, not-an-ip" },
    });
    expect(
      extractClientIp(malformedRightReq, {
        socketIp: "127.0.0.1",
        trustedProxyIps: trusted,
      }),
    ).toBe("127.0.0.1");

    const trailingCommaReq = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.5, " },
    });
    expect(
      extractClientIp(trailingCommaReq, {
        socketIp: "127.0.0.1",
        trustedProxyIps: trusted,
      }),
    ).toBe("127.0.0.1");

    // X-Real-IP used when XFF absent & peer trusted; falls back to peerIp when malformed
    const validRealIpReq = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-real-ip": "198.51.100.33" },
    });
    expect(
      extractClientIp(validRealIpReq, {
        socketIp: "127.0.0.1",
        trustedProxyIps: trusted,
      }),
    ).toBe("198.51.100.33");

    const invalidRealIpReq = new Request("http://localhost/api/v1/auth/login", {
      headers: { "x-real-ip": "198.51.100.33, 198.51.100.44" },
    });
    expect(
      extractClientIp(invalidRealIpReq, {
        socketIp: "127.0.0.1",
        trustedProxyIps: trusted,
      }),
    ).toBe("127.0.0.1");
  });

  test("unavailable socket IP never trusts headers, avoids shared unknown bucket DoS, and fails closed in production", async () => {
    const spoofedWithoutSocket = new Request(
      "http://localhost/api/v1/auth/login",
      {
        headers: {
          "x-forwarded-for": "198.51.100.1",
          "x-real-ip": "198.51.100.2",
        },
      },
    );
    expect(
      extractClientIp(spoofedWithoutSocket, {
        socketIp: null,
        trustedProxyIps: ["127.0.0.1"],
      }),
    ).toBeNull();

    // Isolated per-account fallback in limiter: exhausting userA does NOT lock out userB
    const limiter = createLoginRateLimiter({
      maxAttempts: 2,
      windowSeconds: 60,
    });
    expect(limiter.consume(null, "alice@example.com").allowed).toBe(true);
    expect(limiter.consume(null, "alice@example.com").allowed).toBe(true);
    const blockedAlice = limiter.consume(null, "alice@example.com");
    expect(blockedAlice.allowed).toBe(false);
    expect(blockedAlice.retryAfterSeconds).toBe(60);
    // Different user still allowed instead of hitting a shared "ip:unknown" bucket!
    expect(limiter.consume(null, "bob@example.com").allowed).toBe(true);

    // Production route explicitly fails closed (503) if socket IP is unavailable
    const prodEnv = createUnitTestEnv({
      NODE_ENV: "production",
      COOKIE_SECURE: true,
    });
    const stubAuthService = {
      authenticateSession: async () => null,
      login: async () => {
        throw new Error("Should not execute login when socket IP is unavailable in production");
      },
      logout: async () => undefined,
    } as unknown as AuthService;
    const prodAuthPlugin = createAuthPlugin({
      authService: stubAuthService,
      env: prodEnv,
    });
    const prodApp = new Elysia({ normalize: false })
      .use(requestIdPlugin)
      .use(errorHandlerPlugin)
      .group("/api/v1", (group) =>
        group.use(
          createAuthRoutes({
            authService: stubAuthService,
            authPlugin: prodAuthPlugin,
            env: prodEnv,
          }),
        ),
      );

    const origErr = console.error;
    console.error = () => undefined;
    try {
      const prodRes = await prodApp.handle(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "admin@example.com",
            password: "Password#123",
          }),
        }),
      );
      expect(prodRes.status).toBe(503);
      const body = (await prodRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    } finally {
      console.error = origErr;
    }
  });

  test("caps buckets at maxBuckets, expires properly, and shields blocked buckets from low-attempt flood eviction", () => {
    let nowMs = 100_000;
    const limiter = createLoginRateLimiter({
      maxAttempts: 2,
      windowSeconds: 60,
      maxBuckets: 6,
      now: () => nowMs,
    });

    // Target IP reaches block threshold (2 attempts -> creates ip + ip-email = 2 blocked buckets)
    expect(limiter.consume("192.0.2.1", "target@example.com").allowed).toBe(true);
    expect(limiter.consume("192.0.2.1", "target@example.com").allowed).toBe(true);
    expect(limiter.consume("192.0.2.1", "target@example.com").allowed).toBe(false);

    // Flood with single-attempt keys from distinct IPs up to & past maxBuckets
    for (let i = 10; i < 20; i++) {
      nowMs += 1000;
      expect(limiter.consume(`192.0.2.${i}`, `flood${i}@example.com`).allowed).toBe(
        true,
      );
      expect(limiter.size()).toBeLessThanOrEqual(6);
    }

    // Blocked target IP remains strictly rate-limited (never evicted by flood attempts!)
    const stillBlocked = limiter.consume("192.0.2.1", "target@example.com");
    expect(stillBlocked.allowed).toBe(false);
    expect(stillBlocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    // After window expiry, target IP can attempt again; once capacity is reached,
    // all expired flood buckets are pruned before inserting new active keys.
    nowMs += 60_000;
    expect(limiter.consume("192.0.2.1", "target@example.com").allowed).toBe(true);
    expect(limiter.consume("192.0.2.200", "fresh@example.com").allowed).toBe(true);
    expect(limiter.size()).toBe(4);
  });
});

describe("F-03: API error code parity and structural OpenAPI Admin/Staff schema check", () => {
  type JsonSchemaNode = {
    $ref?: string;
    title?: string;
    type?: string;
    description?: string;
    required?: string[];
    properties?: Record<string, JsonSchemaNode>;
    items?: JsonSchemaNode;
    anyOf?: JsonSchemaNode[];
  };

  function resolveSchemaRef(
    node: JsonSchemaNode | undefined,
    doc: { components?: { schemas?: Record<string, JsonSchemaNode> } },
  ): JsonSchemaNode | undefined {
    if (!node) {
      return undefined;
    }
    if (node.$ref) {
      const prefix = "#/components/schemas/";
      if (node.$ref.startsWith(prefix)) {
        return doc.components?.schemas?.[node.$ref.slice(prefix.length)];
      }
    }
    return node;
  }

  test("frontend API_ERROR_CODES matches backend ERROR_CODES with exact 1-to-1 parity", () => {
    expect([...API_ERROR_CODES]).toEqual([...ERROR_CODES]);
    expect(new Set(API_ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  test("OpenAPI /docs/json schemas structurally include prices on ProductAdminDto and omit them on ProductStaffDto", async () => {
    const app = createApp({
      env: createUnitTestEnv({ ENABLE_SWAGGER: true }),
    });

    const docsRes = await app.handle(new Request("http://localhost/docs/json"));
    expect(docsRes.status).toBe(200);

    const doc = (await docsRes.json()) as {
      paths?: Record<
        string,
        {
          get?: {
            description?: string;
            responses?: Record<
              string,
              {
                content?: {
                  "application/json"?: { schema?: JsonSchemaNode };
                };
              }
            >;
          };
        }
      >;
      components?: { schemas?: Record<string, JsonSchemaNode> };
    };

    const listOp =
      (doc.paths?.["/api/v1/products/"] ?? doc.paths?.["/api/v1/products"])?.get;
    const detailOp = doc.paths?.["/api/v1/products/{id}"]?.get;
    expect(listOp).toBeDefined();
    expect(detailOp).toBeDefined();

    // Verify endpoint role documentation
    for (const op of [listOp!, detailOp!]) {
      expect(op.description).toContain("Admin");
      expect(op.description).toContain("Staff");
      expect(op.description).toContain("ProductAdminDto");
      expect(op.description).toContain("ProductStaffDto");
      expect(op.description).toContain("purchasePrice");
      expect(op.description).toContain("sellingPrice");
    }

    // Navigate GET /api/v1/products/ 200 -> data (array) -> items -> anyOf
    const listEnvelope = resolveSchemaRef(
      listOp!.responses?.["200"]?.content?.["application/json"]?.schema,
      doc,
    );
    const listData = resolveSchemaRef(listEnvelope?.properties?.data, doc);
    const listItems = resolveSchemaRef(listData?.items, doc);
    const listVariants = (listItems?.anyOf ?? []).map((v) =>
      resolveSchemaRef(v, doc),
    );
    expect(listVariants.length).toBe(2);

    // Navigate GET /api/v1/products/{id} 200 -> data -> anyOf
    const detailEnvelope = resolveSchemaRef(
      detailOp!.responses?.["200"]?.content?.["application/json"]?.schema,
      doc,
    );
    const detailData = resolveSchemaRef(detailEnvelope?.properties?.data, doc);
    const detailVariants = (detailData?.anyOf ?? []).map((v) =>
      resolveSchemaRef(v, doc),
    );
    expect(detailVariants.length).toBe(2);

    for (const variants of [listVariants, detailVariants]) {
      const adminSchema = variants.find((v) => v?.title === "ProductAdminDto");
      const staffSchema = variants.find((v) => v?.title === "ProductStaffDto");

      expect(adminSchema).toBeDefined();
      expect(staffSchema).toBeDefined();

      // Admin DTO must explicitly define and require both price fields
      expect(adminSchema!.properties?.purchasePrice).toBeDefined();
      expect(adminSchema!.properties?.sellingPrice).toBeDefined();
      expect(adminSchema!.required).toContain("purchasePrice");
      expect(adminSchema!.required).toContain("sellingPrice");

      // Staff DTO must NEVER expose purchasePrice or sellingPrice
      const staffProps = staffSchema!.properties ?? {};
      expect("purchasePrice" in staffProps).toBe(false);
      expect("sellingPrice" in staffProps).toBe(false);
      expect(staffSchema!.required ?? []).not.toContain("purchasePrice");
      expect(staffSchema!.required ?? []).not.toContain("sellingPrice");
      // Core non-price fields must remain present
      expect("sku" in staffProps).toBe(true);
      expect("currentStock" in staffProps).toBe(true);
      expect("minimumStock" in staffProps).toBe(true);
    }
  });
});

describe("F-04: request schema strictness & normalize=false non-regression across all modules", () => {
  const sampleId = "00000000-0000-4000-8000-000000000010";
  const nowIso = "2026-11-12T00:00:00.000Z";

  function createRegressionTestApp(actorRole: "admin" | "staff" = "admin") {
    const env = createUnitTestEnv();
    const authUser = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Unit Actor",
      email: "actor@example.com",
      role: actorRole,
      isActive: true,
      sessionId: "00000000-0000-4000-8000-000000000099",
    };

    const userDto = {
      id: sampleId,
      name: "Sample User",
      email: "sample@example.com",
      role: "staff" as const,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const categoryDto = {
      id: sampleId,
      name: "Electronics",
      description: "Devices",
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const productAdminDto = {
      id: sampleId,
      category: { id: sampleId, name: "Electronics" },
      sku: "SKU-001",
      name: "Laptop",
      description: "Workstation",
      unit: "pcs",
      purchasePrice: "1000.00",
      sellingPrice: "1500.00",
      currentStock: "10.000",
      minimumStock: "2.000",
      status: "active" as const,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const productStaffDto = {
      id: sampleId,
      category: { id: sampleId, name: "Electronics" },
      sku: "SKU-001",
      name: "Laptop",
      description: "Workstation",
      unit: "pcs",
      currentStock: "10.000",
      minimumStock: "2.000",
      status: "active" as const,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const movementDto = {
      id: sampleId,
      product: {
        id: sampleId,
        sku: "SKU-001",
        name: "Laptop",
        unit: "pcs",
        status: "active" as const,
      },
      type: "in" as const,
      quantity: "5.000",
      stockBefore: "10.000",
      stockAfter: "15.000",
      reason: "Restock",
      notes: null,
      createdBy: { id: authUser.id, name: authUser.name },
      createdAt: nowIso,
    };

    const pageMeta = {
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    };

    const authService = {
      authenticateSession: async () => authUser,
      login: async () => ({
        user: {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
        },
        rawSessionToken: "unit-test-raw-token",
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
      logout: async () => undefined,
    } as unknown as AuthService;

    const usersService = {
      listUsers: async () => ({ items: [userDto], meta: pageMeta }),
      getUserById: async () => userDto,
      createUser: async () => userDto,
      updateUser: async () => userDto,
      updateUserStatus: async () => userDto,
      resetUserPassword: async () => undefined,
    } as unknown as UsersService;

    const categoriesService = {
      listCategories: async () => ({ items: [categoryDto], meta: pageMeta }),
      getCategoryById: async () => categoryDto,
      createCategory: async () => categoryDto,
      updateCategory: async () => categoryDto,
      updateCategoryStatus: async () => categoryDto,
    } as unknown as CategoriesService;

    const productsService = {
      listProducts: async (_q: unknown, role: "admin" | "staff") => ({
        items: [role === "admin" ? productAdminDto : productStaffDto],
        meta: pageMeta,
      }),
      getProductById: async (_id: string, role: "admin" | "staff") =>
        role === "admin" ? productAdminDto : productStaffDto,
      createProduct: async () => productAdminDto,
      updateProduct: async () => productAdminDto,
      updateProductStatus: async () => productAdminDto,
    } as unknown as ProductsService;

    const stockMovementsService = {
      listStockMovements: async () => ({ items: [movementDto], meta: pageMeta }),
      getStockMovementById: async () => movementDto,
      createStockMovement: async () => movementDto,
    } as unknown as StockMovementsService;

    const authPlugin = createAuthPlugin({ authService, env });

    return new Elysia({ normalize: false })
      .use(requestIdPlugin)
      .use(errorHandlerPlugin)
      .group("/api/v1", (group) =>
        group
          .use(createAuthRoutes({ authService, authPlugin, env }))
          .use(createUsersRoutes({ usersService, authPlugin, env }))
          .use(createCategoriesRoutes({ categoriesService, authPlugin }))
          .use(createProductsRoutes({ productsService, authPlugin }))
          .use(createStockMovementsRoutes({ stockMovementsService, authPlugin })),
      );
  }

  async function expectValidationError(
    app: ReturnType<typeof createRegressionTestApp> | ReturnType<typeof createApp>,
    method: string,
    path: string,
    body: unknown,
    rawString = false,
  ) {
    const res = await app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          cookie: "ims_session=unit-test-token",
        },
        body: rawString ? String(body) : JSON.stringify(body),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      success: boolean;
      error: { code: string };
    };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  }

  test("positive regression check: valid bodies, queries, UUID params, and DTO responses succeed with normalize=false", async () => {
    const adminApp = createRegressionTestApp("admin");
    const staffApp = createRegressionTestApp("staff");
    const authHeaders = {
      "content-type": "application/json",
      cookie: "ims_session=unit-test-token",
    };

    // Auth login
    const loginRes = await adminApp.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "  actor@example.com ",
          password: "Password#123",
        }),
      }),
    );
    expect(loginRes.status).toBe(200);
    expect(loginRes.headers.get("set-cookie")).toContain("ims_session=");

    // Users GET list + POST + PATCH + status + password
    const usersListRes = await adminApp.handle(
      new Request(
        "http://localhost/api/v1/users?page=1&pageSize=10&sortBy=name&sortOrder=asc&isActive=true",
        { headers: { cookie: "ims_session=unit-test-token" } },
      ),
    );
    expect(usersListRes.status).toBe(200);

    const userCreateRes = await adminApp.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: "New User",
          email: "new@example.com",
          password: "Password#123",
          role: "staff",
        }),
      }),
    );
    expect(userCreateRes.status).toBe(201);

    const userGetRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/users/${sampleId}`, {
        headers: { cookie: "ims_session=unit-test-token" },
      }),
    );
    expect(userGetRes.status).toBe(200);

    const userUpdateRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/users/${sampleId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Updated User" }),
      }),
    );
    expect(userUpdateRes.status).toBe(200);

    const userStatusRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/users/${sampleId}/status`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(userStatusRes.status).toBe(200);

    const userPwRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/users/${sampleId}/password`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ newPassword: "NewPassword#123" }),
      }),
    );
    expect(userPwRes.status).toBe(200);

    // Categories GET + POST + PATCH + status
    const catListRes = await adminApp.handle(
      new Request(
        "http://localhost/api/v1/categories?page=1&pageSize=10&isActive=true",
        { headers: { cookie: "ims_session=unit-test-token" } },
      ),
    );
    expect(catListRes.status).toBe(200);

    const catCreateRes = await adminApp.handle(
      new Request("http://localhost/api/v1/categories", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Electronics", description: null }),
      }),
    );
    expect(catCreateRes.status).toBe(201);

    const catUpdateRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/categories/${sampleId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Electronics 2" }),
      }),
    );
    expect(catUpdateRes.status).toBe(200);

    const catStatusRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/categories/${sampleId}/status`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ isActive: true }),
      }),
    );
    expect(catStatusRes.status).toBe(200);

    // Products Admin & Staff GET + POST + PATCH + status
    const prodAdminRes = await adminApp.handle(
      new Request(
        `http://localhost/api/v1/products?page=1&pageSize=10&categoryId=${sampleId}&status=active&lowStock=false&sortBy=name&sortOrder=asc`,
        { headers: { cookie: "ims_session=unit-test-token" } },
      ),
    );
    expect(prodAdminRes.status).toBe(200);
    const prodAdminJson = (await prodAdminRes.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(prodAdminJson.data[0]!.purchasePrice).toBe("1000.00");

    const prodStaffRes = await staffApp.handle(
      new Request(`http://localhost/api/v1/products/${sampleId}`, {
        headers: { cookie: "ims_session=unit-test-token" },
      }),
    );
    expect(prodStaffRes.status).toBe(200);
    const prodStaffJson = (await prodStaffRes.json()) as {
      data: Record<string, unknown>;
    };
    expect("purchasePrice" in prodStaffJson.data).toBe(false);
    expect("sellingPrice" in prodStaffJson.data).toBe(false);

    const prodCreateRes = await adminApp.handle(
      new Request("http://localhost/api/v1/products", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          categoryId: sampleId,
          sku: "sku-001",
          name: "Laptop",
          unit: "pcs",
          purchasePrice: "1000.00",
          sellingPrice: "1500.00",
          minimumStock: "2",
        }),
      }),
    );
    expect(prodCreateRes.status).toBe(201);

    const prodUpdateRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/products/${sampleId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: "Laptop Pro" }),
      }),
    );
    expect(prodUpdateRes.status).toBe(200);

    const prodStatusRes = await adminApp.handle(
      new Request(`http://localhost/api/v1/products/${sampleId}/status`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ status: "inactive" }),
      }),
    );
    expect(prodStatusRes.status).toBe(200);

    // Stock Movements GET + POST
    const movListRes = await adminApp.handle(
      new Request(
        `http://localhost/api/v1/stock-movements?page=1&pageSize=10&productId=${sampleId}&type=in&sortOrder=desc`,
        { headers: { cookie: "ims_session=unit-test-token" } },
      ),
    );
    expect(movListRes.status).toBe(200);

    const movCreateRes = await adminApp.handle(
      new Request("http://localhost/api/v1/stock-movements", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          productId: sampleId,
          type: "in",
          quantity: "5",
          reason: "Restock",
        }),
      }),
    );
    expect(movCreateRes.status).toBe(201);
  });

  test("negative check: rejects unknown properties across auth, users, categories, products, and stock-movements plus invalid formats", async () => {
    const app = createRegressionTestApp("admin");
    const fullApp = createApp({ env: createUnitTestEnv() });

    // Unknown property rejected on createApp() & module routes
    await expectValidationError(fullApp, "POST", "/api/v1/auth/login", {
      email: "user@example.com",
      password: "Password#123",
      unknownField: true,
    });
    await expectValidationError(app, "POST", "/api/v1/auth/login", {
      email: "user@example.com",
      password: "Password#123",
      unknownField: true,
    });

    // Users (4 body schemas)
    await expectValidationError(app, "POST", "/api/v1/users", {
      name: "Test User",
      email: "user@example.com",
      password: "Password#123",
      role: "staff",
      unknownField: true,
    });
    await expectValidationError(app, "PATCH", `/api/v1/users/${sampleId}`, {
      name: "Updated User",
      unknownField: true,
    });
    await expectValidationError(
      app,
      "PATCH",
      `/api/v1/users/${sampleId}/status`,
      { isActive: false, unknownField: true },
    );
    await expectValidationError(
      app,
      "PATCH",
      `/api/v1/users/${sampleId}/password`,
      { newPassword: "NewPassword#123", unknownField: true },
    );

    // Categories (3 body schemas)
    await expectValidationError(app, "POST", "/api/v1/categories", {
      name: "Electronics",
      unknownField: true,
    });
    await expectValidationError(
      app,
      "PATCH",
      `/api/v1/categories/${sampleId}`,
      { name: "Electronics Updated", unknownField: true },
    );
    await expectValidationError(
      app,
      "PATCH",
      `/api/v1/categories/${sampleId}/status`,
      { isActive: false, unknownField: true },
    );

    // Products (3 body schemas)
    await expectValidationError(app, "POST", "/api/v1/products", {
      categoryId: sampleId,
      sku: "SKU-001",
      name: "Laptop",
      unit: "pcs",
      purchasePrice: "1000.00",
      sellingPrice: "1500.00",
      unknownField: true,
    });
    await expectValidationError(app, "PATCH", `/api/v1/products/${sampleId}`, {
      name: "Laptop Pro",
      unknownField: true,
    });
    await expectValidationError(
      app,
      "PATCH",
      `/api/v1/products/${sampleId}/status`,
      { status: "active", unknownField: true },
    );

    // Stock Movements (1 body schema)
    await expectValidationError(app, "POST", "/api/v1/stock-movements", {
      productId: sampleId,
      type: "in",
      quantity: "5",
      reason: "Restock",
      unknownField: true,
    });

    // Invalid input formats still yield 400 VALIDATION_ERROR
    await expectValidationError(app, "POST", "/api/v1/auth/login", {
      email: "not-an-email",
      password: "Password#123",
    });
    await expectValidationError(app, "POST", "/api/v1/auth/login", {
      email: "user@example.com",
      password: "short",
    });
    await expectValidationError(
      app,
      "GET",
      "/api/v1/users/not-a-valid-uuid",
      undefined,
    );
    await expectValidationError(
      app,
      "POST",
      "/api/v1/auth/login",
      "{invalid-json",
      true,
    );
  });
});
