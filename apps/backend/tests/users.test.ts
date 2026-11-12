import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { createApp } from "../src/app";
import { BusinessRuleError } from "../src/common/errors";
import type { BackendEnv } from "../src/config/env";
import { db } from "../src/db";
import { sessions, users, type UserRole } from "../src/db/schema";
import { createAuthRepository } from "../src/modules/auth/auth.repository";
import { createUsersRepository } from "../src/modules/users/users.repository";

function createTestEnv(): BackendEnv {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    DATABASE_URL:
      process.env.DATABASE_URL_TEST ??
      "postgresql://blocked:blocked@127.0.0.1:1/database_url_test_not_configured",
    BUSINESS_TIMEZONE: "Asia/Jakarta",
    CORS_ALLOWED_ORIGINS: ["http://localhost:3000"],
    SESSION_COOKIE_NAME: "ims_session",
    SESSION_TTL_DAYS: 7,
    COOKIE_SECURE: false,
    COOKIE_SAME_SITE: "lax",
    TRUSTED_PROXY_IPS: [],
    LOGIN_RATE_LIMIT_MAX: 100,
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
    ENABLE_SWAGGER: false,
  };
}

function extractCookiePair(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("Expected Set-Cookie header");
  }
  const match = /ims_session=([^;]+)/.exec(setCookieHeader);
  if (!match?.[1]) {
    throw new Error(`Missing ims_session cookie in: ${setCookieHeader}`);
  }
  return `ims_session=${match[1]}`;
}

describe("users API endpoints", () => {
  const app = createApp({ env: createTestEnv() });
  const runId = crypto.randomUUID().slice(0, 8);
  const password = "UserTestPassword#2026";
  const adminEmail = `users-admin-${runId}@example.com`;
  const staffEmail = `users-staff-${runId}@example.com`;

  const createdUserIds: string[] = [];
  let adminId = "";
  let staffId = "";
  let adminCookie = "";
  let staffCookie = "";

  async function seedUser(input: {
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  }): Promise<string> {
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "argon2id",
    });
    const rows = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: input.isActive,
      })
      .returning({ id: users.id });

    const created = rows[0]!;
    createdUserIds.push(created.id);
    return created.id;
  }

  async function loginAs(email: string, pw = password): Promise<string> {
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      }),
    );
    expect(res.status).toBe(200);
    return extractCookiePair(res.headers.get("set-cookie"));
  }

  beforeAll(async () => {
    adminId = await seedUser({
      name: `Admin Primary ${runId}`,
      email: adminEmail,
      role: "admin",
      isActive: true,
    });
    staffId = await seedUser({
      name: `Staff Reader ${runId}`,
      email: staffEmail,
      role: "staff",
      isActive: true,
    });

    adminCookie = await loginAs(adminEmail);
    staffCookie = await loginAs(staffEmail);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  test("rejects unauthenticated (401) and staff (403) access on user management endpoints", async () => {
    const unauthRes = await app.handle(
      new Request("http://localhost/api/v1/users"),
    );
    expect(unauthRes.status).toBe(401);

    const staffListRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        headers: { cookie: staffCookie },
      }),
    );
    expect(staffListRes.status).toBe(403);

    const staffCreateRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: staffCookie,
        },
        body: JSON.stringify({
          name: "Blocked",
          email: `blocked-${runId}@example.com`,
          password,
          role: "staff",
        }),
      }),
    );
    expect(staffCreateRes.status).toBe(403);
  });

  test("Admin creates, lists, searches, sorts, fetches detail, and rejects duplicate emails / whitespace passwords", async () => {
    const createdEmail = `users-new-${runId}@example.com`;
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: `  Staff Gudang 100% ${runId}  `,
          email: `  ${createdEmail.toUpperCase()}  `,
          password,
          role: "staff",
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as {
      success: boolean;
      data: {
        id: string;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
      };
    };
    expect(createBody.success).toBe(true);
    expect(createBody.data.name).toBe(`Staff Gudang 100% ${runId}`);
    expect(createBody.data.email).toBe(createdEmail);
    expect(createBody.data.role).toBe("staff");
    expect(createBody.data.isActive).toBe(true);
    expect("passwordHash" in createBody.data).toBe(false);
    createdUserIds.push(createBody.data.id);

    const duplicateRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Duplicate Email User",
          email: createdEmail.toUpperCase(),
          password,
          role: "staff",
        }),
      }),
    );
    expect(duplicateRes.status).toBe(409);
    const dupBody = (await duplicateRes.json()) as { error: { code: string } };
    expect(dupBody.error.code).toBe("DUPLICATE_EMAIL");

    const blankPassRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Blank Password",
          email: `blank-${runId}@example.com`,
          password: "        ",
          role: "staff",
        }),
      }),
    );
    expect(blankPassRes.status).toBe(400);

    const listRes = await app.handle(
      new Request(
        `http://localhost/api/v1/users?search=${encodeURIComponent(`100% ${runId}`)}&role=staff&isActive=true&sortBy=name&sortOrder=asc`,
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      data: Array<{ id: string }>;
      meta: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
    expect(listBody.data.map((u) => u.id)).toEqual([createBody.data.id]);
    expect(listBody.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });

    const invalidSortRes = await app.handle(
      new Request("http://localhost/api/v1/users?sortBy=passwordHash", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(invalidSortRes.status).toBe(400);

    const detailRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${createBody.data.id}`, {
        headers: { cookie: adminCookie },
      }),
    );
    expect(detailRes.status).toBe(200);

    const missingDetailRes = await app.handle(
      new Request(
        "http://localhost/api/v1/users/00000000-0000-4000-8000-000000000000",
        { headers: { cookie: adminCookie } },
      ),
    );
    expect(missingDetailRes.status).toBe(404);
  });

  test("enforces self/last-admin guards, revokes sessions on deactivation/password reset, and handles idempotent status", async () => {
    const emptyPatchRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(emptyPatchRes.status).toBe(400);

    // Self-demotion blocked (422)
    const selfDemoteRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ role: "staff" }),
      }),
    );
    expect(selfDemoteRes.status).toBe(422);

    // Self-deactivation blocked (422)
    const selfDeactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(selfDeactivateRes.status).toBe(422);

    // Create a second active Admin and verify last-active-admin protection when trying from another Admin
    const secondAdminEmail = `users-admin2-${runId}@example.com`;
    const secondAdminId = await seedUser({
      name: `Admin Secondary ${runId}`,
      email: secondAdminEmail,
      role: "admin",
      isActive: true,
    });
    const secondAdminCookie = await loginAs(secondAdminEmail);

    // Second admin deactivates primary admin -> allowed because second admin remains active
    const deactivatePrimaryRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(deactivatePrimaryRes.status).toBe(200);
    const deactivatedData = (await deactivatePrimaryRes.json()) as {
      data: { isActive: boolean; updatedAt: string };
    };
    expect(deactivatedData.data.isActive).toBe(false);

    // Primary admin's old session is revoked and cannot authenticate
    const revokedMeRes = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(revokedMeRes.status).toBe(401);

    // Idempotent repeat deactivation keeps updatedAt unchanged
    const repeatDeactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(repeatDeactivateRes.status).toBe(200);
    const repeatBody = (await repeatDeactivateRes.json()) as {
      data: { updatedAt: string };
    };
    expect(repeatBody.data.updatedAt).toBe(deactivatedData.data.updatedAt);

    // Even when primary admin is inactive, second admin still cannot self-demote or self-deactivate
    const lastAdminDemoteRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${secondAdminId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ role: "staff" }),
      }),
    );
    expect(lastAdminDemoteRes.status).toBe(422);

    // Reactivate primary admin: old revoked session MUST stay dead
    const reactivateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: secondAdminCookie,
        },
        body: JSON.stringify({ isActive: true }),
      }),
    );
    expect(reactivateRes.status).toBe(200);
    const oldSessionAfterReactivate = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: adminCookie },
      }),
    );
    expect(oldSessionAfterReactivate.status).toBe(401);

    // Promote staff to admin, then reset password of secondAdmin via primary admin, then test self-password reset clears cookie
    const newPrimaryCookie = await loginAs(adminEmail);
    const resetOtherRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${secondAdminId}/password`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: newPrimaryCookie,
        },
        body: JSON.stringify({ newPassword: "NewStrongPassword#99" }),
      }),
    );
    expect(resetOtherRes.status).toBe(200);

    // Second admin's session must be revoked after password reset
    const secondMeAfterReset = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { cookie: secondAdminCookie },
      }),
    );
    expect(secondMeAfterReset.status).toBe(401);

    // Self password reset revokes sessions AND emits cleared Set-Cookie header
    const selfResetRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/password`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: newPrimaryCookie,
        },
        body: JSON.stringify({ newPassword: "SelfResetPassword#99" }),
      }),
    );
    expect(selfResetRes.status).toBe(200);
    expect(selfResetRes.headers.get("set-cookie")).toContain("Max-Age=0");

    const activeSessionsAfterSelfReset = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, adminId));
    expect(
      activeSessionsAfterSelfReset.every((row) => row.revokedAt !== null),
    ).toBe(true);

    // Can login with new password
    adminCookie = await loginAs(adminEmail, "SelfResetPassword#99");
    expect(adminCookie).toContain("ims_session=");

    // Deactivate temporary secondAdmin so later concurrency tests observe clean suite state
    const cleanupSecondAdminRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${secondAdminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(cleanupSecondAdminRes.status).toBe(200);
  });

  test("rejects unknown properties on user payloads with 400 VALIDATION_ERROR", async () => {
    const createRes = await app.handle(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Extra Prop User",
          email: `strict-user-${runId}@example.com`,
          password: "StrictPassword#2026",
          role: "staff",
          extraField: "unexpected",
        }),
      }),
    );
    expect(createRes.status).toBe(400);
    const createBody = (await createRes.json()) as { error: { code: string } };
    expect(createBody.error.code).toBe("VALIDATION_ERROR");

    const updateRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          name: "Renamed Staff",
          extraField: "unexpected",
        }),
      }),
    );
    expect(updateRes.status).toBe(400);
    const updateBody = (await updateRes.json()) as { error: { code: string } };
    expect(updateBody.error.code).toBe("VALIDATION_ERROR");

    const statusRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          isActive: true,
          extraField: "unexpected",
        }),
      }),
    );
    expect(statusRes.status).toBe(400);
    const statusBody = (await statusRes.json()) as { error: { code: string } };
    expect(statusBody.error.code).toBe("VALIDATION_ERROR");

    const passwordRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${staffId}/password`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: adminCookie,
        },
        body: JSON.stringify({
          newPassword: "AnotherValidPassword#99",
          extraField: "unexpected",
        }),
      }),
    );
    expect(passwordRes.status).toBe(400);
    const passwordBody = (await passwordRes.json()) as {
      error: { code: string };
    };
    expect(passwordBody.error.code).toBe("VALIDATION_ERROR");
  });

  test("serializes concurrent admin membership mutations without AB-BA deadlock and protects last active admin", async () => {
    const getFixtureActiveAdminIds = async (
      scopedIds: string[],
    ): Promise<string[]> => {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "admin"),
            eq(users.isActive, true),
            inArray(users.id, scopedIds),
          ),
        );
      return rows.map((r) => r.id);
    };

    const getExternalActiveAdminCount = async (): Promise<number> => {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "admin"),
            eq(users.isActive, true),
            notInArray(users.id, createdUserIds),
          ),
        );
      return rows.length;
    };

    const externalActiveAdminsBefore = await getExternalActiveAdminCount();

    const peerAEmail = `peer-admin-a-${runId}@example.com`;
    const peerBEmail = `peer-admin-b-${runId}@example.com`;
    const peerAId = await seedUser({
      name: `Peer Admin A ${runId}`,
      email: peerAEmail,
      role: "admin",
      isActive: true,
    });
    const peerBId = await seedUser({
      name: `Peer Admin B ${runId}`,
      email: peerBEmail,
      role: "admin",
      isActive: true,
    });
    const peerACookie = await loginAs(peerAEmail);
    const peerBCookie = await loginAs(peerBEmail);

    // Temporarily deactivate suite primary admin so only [peerAId, peerBId] remain active within this suite's fixtures
    const deactivatePrimaryRes = await app.handle(
      new Request(`http://localhost/api/v1/users/${adminId}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: peerACookie,
        },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(deactivatePrimaryRes.status).toBe(200);

    try {
      const fixtureActiveBefore = await getFixtureActiveAdminIds([
        adminId,
        peerAId,
        peerBId,
      ]);
      expect(fixtureActiveBefore.sort()).toEqual([peerAId, peerBId].sort());

      // 1. HTTP concurrent cross-demotion
      const [demoteBRes, demoteARes] = await Promise.all([
        app.handle(
          new Request(`http://localhost/api/v1/users/${peerBId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: peerACookie,
            },
            body: JSON.stringify({ role: "staff" }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/users/${peerAId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: peerBCookie,
            },
            body: JSON.stringify({ role: "staff" }),
          }),
        ),
      ]);

      const demoteStatuses = [demoteBRes.status, demoteARes.status].sort(
        (a, b) => a - b,
      );
      if (externalActiveAdminsBefore === 0) {
        expect(demoteStatuses[0]).toBe(200);
        expect([403, 422]).toContain(demoteStatuses[1]!);
        const failedDemoteRes =
          demoteBRes.status !== 200 ? demoteBRes : demoteARes;
        const failedDemoteBody = (await failedDemoteRes.json()) as {
          error: { code: string };
        };
        expect(failedDemoteBody.error.code).toBe(
          failedDemoteRes.status === 422 ? "BUSINESS_RULE_VIOLATION" : "FORBIDDEN",
        );
      } else {
        expect(demoteStatuses.every((s) => [200, 403, 422].includes(s))).toBe(
          true,
        );
      }

      const activeAfterDemote = await getFixtureActiveAdminIds([
        peerAId,
        peerBId,
      ]);
      const demoteSurvivorId = activeAfterDemote[0] ?? null;
      const demotedPeerId =
        demoteBRes.status === 200 ? peerBId : peerAId;

      if (externalActiveAdminsBefore === 0) {
        expect(activeAfterDemote.length).toBe(1);
        const demoteSurvivorCookie =
          demoteSurvivorId === peerAId ? peerACookie : peerBCookie;

        // Restore demoted peer back to admin -> 2 active fixture admins again
        const restorePeerRes = await app.handle(
          new Request(`http://localhost/api/v1/users/${demotedPeerId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: demoteSurvivorCookie,
            },
            body: JSON.stringify({ role: "admin" }),
          }),
        );
        expect(restorePeerRes.status).toBe(200);
      } else {
        await db
          .update(users)
          .set({ role: "admin" })
          .where(inArray(users.id, [peerAId, peerBId]));
      }

      expect(
        (await getFixtureActiveAdminIds([peerAId, peerBId])).sort(),
      ).toEqual([peerAId, peerBId].sort());

      // 1b. Direct PostgreSQL transaction cross-demotion proving pg_advisory_xact_lock serializes mutations
      const usersRepo = createUsersRepository(db);
      const authRepo = createAuthRepository(db);
      const txDemoteResults = await Promise.allSettled([
        usersRepo.updateUserInTx({
          id: peerBId,
          actorUserId: peerAId,
          changes: { role: "staff" },
        }),
        usersRepo.updateUserInTx({
          id: peerAId,
          actorUserId: peerBId,
          changes: { role: "staff" },
        }),
      ]);
      const txDemoteFulfilled = txDemoteResults.filter(
        (r) => r.status === "fulfilled",
      );
      const txDemoteRejected = txDemoteResults.filter(
        (r) => r.status === "rejected",
      );
      if (externalActiveAdminsBefore === 0) {
        expect(txDemoteFulfilled.length).toBe(1);
        expect(txDemoteRejected.length).toBe(1);
        expect(txDemoteRejected[0]?.reason).toBeInstanceOf(BusinessRuleError);
        const activeAfterTxDemote = await getFixtureActiveAdminIds([
          peerAId,
          peerBId,
        ]);
        expect(activeAfterTxDemote.length).toBe(1);
        const txSurvivorId = activeAfterTxDemote[0]!;
        const txDemotedId = txSurvivorId === peerAId ? peerBId : peerAId;
        await usersRepo.updateUserInTx({
          id: txDemotedId,
          actorUserId: txSurvivorId,
          changes: { role: "admin" },
        });
      } else {
        expect(txDemoteRejected.length).toBe(0);
        await db
          .update(users)
          .set({ role: "admin" })
          .where(inArray(users.id, [peerAId, peerBId]));
      }
      expect(
        (await getFixtureActiveAdminIds([peerAId, peerBId])).sort(),
      ).toEqual([peerAId, peerBId].sort());

      // Re-login both peers cleanly for cross-deactivation test
      const freshPeerACookie = await loginAs(peerAEmail);
      const freshPeerBCookie = await loginAs(peerBEmail);

      // 2. HTTP concurrent cross-deactivation:
      // Rejecting concurrent second deactivation returns 422 BUSINESS_RULE_VIOLATION or 401 UNAUTHENTICATED
      const [deactBRes, deactARes] = await Promise.all([
        app.handle(
          new Request(`http://localhost/api/v1/users/${peerBId}/status`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: freshPeerACookie,
            },
            body: JSON.stringify({ isActive: false }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/users/${peerAId}/status`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: freshPeerBCookie,
            },
            body: JSON.stringify({ isActive: false }),
          }),
        ),
      ]);

      const deactStatuses = [deactBRes.status, deactARes.status].sort(
        (a, b) => a - b,
      );
      if (externalActiveAdminsBefore === 0) {
        expect(deactStatuses[0]).toBe(200);
        expect([401, 422]).toContain(deactStatuses[1]!);
        const failedDeactRes =
          deactBRes.status !== 200 ? deactBRes : deactARes;
        const failedDeactBody = (await failedDeactRes.json()) as {
          error: { code: string };
        };
        expect(failedDeactBody.error.code).toBe(
          failedDeactRes.status === 422
            ? "BUSINESS_RULE_VIOLATION"
            : "UNAUTHENTICATED",
        );
      } else {
        expect(deactStatuses.every((s) => [200, 401, 422].includes(s))).toBe(
          true,
        );
      }

      const activeAfterDeact = await getFixtureActiveAdminIds([
        peerAId,
        peerBId,
      ]);
      const deactivatedPeerId = deactBRes.status === 200 ? peerBId : peerAId;
      const deactivatedCookie =
        deactBRes.status === 200 ? freshPeerBCookie : freshPeerACookie;

      // Deactivated admin sessions must be revoked
      const revokedMeRes = await app.handle(
        new Request("http://localhost/api/v1/auth/me", {
          headers: { cookie: deactivatedCookie },
        }),
      );
      expect(revokedMeRes.status).toBe(401);

      let survivorCookie =
        deactBRes.status === 200 ? freshPeerACookie : freshPeerBCookie;

      if (externalActiveAdminsBefore === 0) {
        expect(activeAfterDeact.length).toBe(1);
        const reactivatePeerRes = await app.handle(
          new Request(`http://localhost/api/v1/users/${deactivatedPeerId}/status`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: survivorCookie,
            },
            body: JSON.stringify({ isActive: true }),
          }),
        );
        expect(reactivatePeerRes.status).toBe(200);
      } else {
        await db
          .update(users)
          .set({ isActive: true })
          .where(inArray(users.id, [peerAId, peerBId]));
        survivorCookie = await loginAs(peerAEmail);
      }
      expect(
        (await getFixtureActiveAdminIds([peerAId, peerBId])).length,
      ).toBe(2);

      // 2b. Direct PostgreSQL transaction cross-deactivation
      const txDeactResults = await Promise.allSettled([
        usersRepo.updateUserStatusInTx({
          id: peerBId,
          actorUserId: peerAId,
          isActive: false,
          revokeSessions: authRepo.revokeAllSessionsForUser,
        }),
        usersRepo.updateUserStatusInTx({
          id: peerAId,
          actorUserId: peerBId,
          isActive: false,
          revokeSessions: authRepo.revokeAllSessionsForUser,
        }),
      ]);
      const txDeactFulfilled = txDeactResults.filter(
        (r) => r.status === "fulfilled",
      );
      const txDeactRejected = txDeactResults.filter(
        (r) => r.status === "rejected",
      );
      if (externalActiveAdminsBefore === 0) {
        expect(txDeactFulfilled.length).toBe(1);
        expect(txDeactRejected.length).toBe(1);
        expect(txDeactRejected[0]?.reason).toBeInstanceOf(BusinessRuleError);
        const activeAfterTxDeact = await getFixtureActiveAdminIds([
          peerAId,
          peerBId,
        ]);
        expect(activeAfterTxDeact.length).toBe(1);
        const txDeactSurvivorId = activeAfterTxDeact[0]!;
        const txDeactivatedId =
          txDeactSurvivorId === peerAId ? peerBId : peerAId;
        await usersRepo.updateUserStatusInTx({
          id: txDeactivatedId,
          actorUserId: txDeactSurvivorId,
          isActive: true,
          revokeSessions: authRepo.revokeAllSessionsForUser,
        });
      } else {
        expect(txDeactRejected.length).toBe(0);
        await db
          .update(users)
          .set({ isActive: true })
          .where(inArray(users.id, [peerAId, peerBId]));
        survivorCookie = await loginAs(peerAEmail);
      }
      expect(
        (await getFixtureActiveAdminIds([peerAId, peerBId])).sort(),
      ).toEqual([peerAId, peerBId].sort());

      // Ensure deactivatedPeerId is actually inactive before section 3 (in case peerB/peerA differed)
      const [ensureDeactId, ensureSurvId] = [peerBId, peerAId];
      survivorCookie = await loginAs(peerAEmail);

      // 3. Concurrent create new Admin + deactivate peer Admin -> serialized cleanly
      const createdAdminEmail = `concurrent-new-admin-${runId}@example.com`;
      const [createAdminRes, deactTargetRes] = await Promise.all([
        app.handle(
          new Request("http://localhost/api/v1/users", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: survivorCookie,
            },
            body: JSON.stringify({
              name: `Concurrent Created Admin ${runId}`,
              email: createdAdminEmail,
              password: "ConcurrentAdmin#2026",
              role: "admin",
            }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/users/${ensureDeactId}/status`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: survivorCookie,
            },
            body: JSON.stringify({ isActive: false }),
          }),
        ),
      ]);
      expect(createAdminRes.status).toBe(201);
      expect(deactTargetRes.status).toBe(200);
      const createdAdminBody = (await createAdminRes.json()) as {
        data: { id: string; role: UserRole; isActive: boolean };
      };
      const createdAdminId = createdAdminBody.data.id;
      createdUserIds.push(createdAdminId);
      expect(createdAdminBody.data.role).toBe("admin");
      expect(createdAdminBody.data.isActive).toBe(true);
      expect(
        (
          await getFixtureActiveAdminIds([
            ensureSurvId,
            ensureDeactId,
            createdAdminId,
          ])
        ).sort(),
      ).toEqual([ensureSurvId, createdAdminId].sort());

      // 4. Concurrent promote Staff -> Admin + deactivate created Admin
      const promoStaffId = await seedUser({
        name: `Promo Candidate ${runId}`,
        email: `promo-candidate-${runId}@example.com`,
        role: "staff",
        isActive: true,
      });
      const [promoteStaffRes, deactCreatedAdminRes] = await Promise.all([
        app.handle(
          new Request(`http://localhost/api/v1/users/${promoStaffId}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: survivorCookie,
            },
            body: JSON.stringify({ role: "admin" }),
          }),
        ),
        app.handle(
          new Request(`http://localhost/api/v1/users/${createdAdminId}/status`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: survivorCookie,
            },
            body: JSON.stringify({ isActive: false }),
          }),
        ),
      ]);
      expect(promoteStaffRes.status).toBe(200);
      expect(deactCreatedAdminRes.status).toBe(200);
      const activeAfterPromoteRace = await getFixtureActiveAdminIds([
        ensureSurvId,
        createdAdminId,
        promoStaffId,
      ]);
      expect(activeAfterPromoteRace.sort()).toEqual(
        [ensureSurvId, promoStaffId].sort(),
      );
      expect(activeAfterPromoteRace).not.toContain(createdAdminId);
    } finally {
      // Restore suite primary admin cleanly even if an assertion fails mid-test
      await db
        .update(users)
        .set({ isActive: true, role: "admin" })
        .where(eq(users.id, adminId));
    }
  });
});
