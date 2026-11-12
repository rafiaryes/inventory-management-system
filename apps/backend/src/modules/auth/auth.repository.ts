import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import { sessions, users } from "../../db/schema";
import type { ActiveSessionRecord, UserAuthRecord } from "./auth.types";

export type SessionUpdateExecutor = Pick<Database, "update">;

export interface AuthRepository {
  findUserByEmail(normalizedEmail: string): Promise<UserAuthRecord | null>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    ttlDays: number;
  }): Promise<{ id: string; expiresAt: Date }>;
  findActiveSessionByTokenHash(
    tokenHash: string,
  ): Promise<ActiveSessionRecord | null>;
  revokeSessionById(sessionId: string): Promise<void>;
  revokeAllSessionsForUser(
    userId: string,
    executor?: SessionUpdateExecutor,
  ): Promise<void>;
}

/**
 * Creates the persistence repository for users authentication and DB-backed sessions.
 */
export function createAuthRepository(db: Database): AuthRepository {
  return {
    async findUserByEmail(
      normalizedEmail: string,
    ): Promise<UserAuthRecord | null> {
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      return rows[0] ?? null;
    },

    async createSession(input: {
      userId: string;
      tokenHash: string;
      ttlDays: number;
    }): Promise<{ id: string; expiresAt: Date }> {
      if (!Number.isInteger(input.ttlDays) || input.ttlDays < 1) {
        throw new Error(`Invalid session ttlDays: ${input.ttlDays}`);
      }

      const rows = await db
        .insert(sessions)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: sql`NOW() + make_interval(days => ${input.ttlDays}::int)`,
        })
        .returning({
          id: sessions.id,
          expiresAt: sessions.expiresAt,
        });

      const created = rows[0];
      if (!created) {
        throw new Error("Failed to create session record");
      }

      return created;
    },

    async findActiveSessionByTokenHash(
      tokenHash: string,
    ): Promise<ActiveSessionRecord | null> {
      const rows = await db
        .select({
          sessionId: sessions.id,
          expiresAt: sessions.expiresAt,
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
          userRole: users.role,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, sql`NOW()`),
            eq(users.isActive, true),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        sessionId: row.sessionId,
        expiresAt: row.expiresAt,
        user: {
          id: row.userId,
          name: row.userName,
          email: row.userEmail,
          role: row.userRole,
        },
      };
    },

    async revokeSessionById(sessionId: string): Promise<void> {
      await db
        .update(sessions)
        .set({ revokedAt: sql`NOW()` })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },

    async revokeAllSessionsForUser(
      userId: string,
      executor: SessionUpdateExecutor = db,
    ): Promise<void> {
      await executor
        .update(sessions)
        .set({ revokedAt: sql`NOW()` })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    },
  };
}
