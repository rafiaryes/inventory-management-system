import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { isUniqueViolation } from "../../common/db-errors";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "../../common/errors";
import { escapeLikePattern } from "../../common/pagination";
import type { Database } from "../../db";
import { users, type UserRow } from "../../db/schema";
import type { SessionUpdateExecutor } from "../auth/auth.repository";
import type { ListUsersQuery, UpdateUserInput, UserSortField } from "./users.types";

const USER_SORT_COLUMNS = {
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  name: users.name,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
} as const satisfies Record<UserSortField, unknown>;

export interface UsersRepository {
  findMany(query: ListUsersQuery): Promise<{ items: UserRow[]; totalItems: number }>;
  findById(id: string): Promise<UserRow | null>;
  create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRow["role"];
  }): Promise<UserRow>;
  updateUserInTx(input: {
    id: string;
    actorUserId: string;
    changes: UpdateUserInput;
  }): Promise<UserRow>;
  updateUserStatusInTx(input: {
    id: string;
    actorUserId: string;
    isActive: boolean;
    revokeSessions: (userId: string, executor: SessionUpdateExecutor) => Promise<void>;
  }): Promise<UserRow>;
  resetPasswordInTx(input: {
    id: string;
    passwordHash: string;
    revokeSessions: (userId: string, executor: SessionUpdateExecutor) => Promise<void>;
  }): Promise<void>;
}

/**
 * Creates the database persistence repository for Admin user management.
 */
export function createUsersRepository(db: Database): UsersRepository {
  return {
    async findMany(
      query: ListUsersQuery,
    ): Promise<{ items: UserRow[]; totalItems: number }> {
      const conditions: SQL[] = [];

      if (query.search) {
        const pattern = `%${escapeLikePattern(query.search)}%`;
        const searchCond = or(
          ilike(users.name, pattern),
          ilike(users.email, pattern),
        );
        if (searchCond) {
          conditions.push(searchCond);
        }
      }

      if (query.role !== undefined) {
        conditions.push(eq(users.role, query.role));
      }

      if (query.isActive !== undefined) {
        conditions.push(eq(users.isActive, query.isActive));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const sortColumn = USER_SORT_COLUMNS[query.sortBy];
      const orderFn = query.sortOrder === "asc" ? asc : desc;
      const offset = (query.page - 1) * query.pageSize;

      const [countRows, items] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(whereClause),
        db
          .select()
          .from(users)
          .where(whereClause)
          .orderBy(orderFn(sortColumn), orderFn(users.id))
          .limit(query.pageSize)
          .offset(offset),
      ]);

      return {
        items,
        totalItems: countRows[0]?.count ?? 0,
      };
    },

    async findById(id: string): Promise<UserRow | null> {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async create(input): Promise<UserRow> {
      try {
        const rows = await db
          .insert(users)
          .values({
            name: input.name,
            email: input.email,
            passwordHash: input.passwordHash,
            role: input.role,
            isActive: true,
          })
          .returning();

        const created = rows[0];
        if (!created) {
          throw new Error("Failed to insert user record");
        }
        return created;
      } catch (error) {
        if (isUniqueViolation(error, "users_email_normalized_uidx")) {
          throw new ConflictError("Email sudah digunakan", "DUPLICATE_EMAIL");
        }
        throw error;
      }
    },

    async updateUserInTx({ id, actorUserId, changes }): Promise<UserRow> {
      return db.transaction(async (tx) => {
        const targetRows = await tx
          .select()
          .from(users)
          .where(eq(users.id, id))
          .for("update");

        const existing = targetRows[0];
        if (!existing) {
          throw new NotFoundError("Pengguna tidak ditemukan");
        }

        if (
          changes.role !== undefined &&
          existing.role === "admin" &&
          changes.role !== "admin"
        ) {
          if (existing.id === actorUserId) {
            throw new BusinessRuleError(
              "Admin tidak dapat menurunkan role dirinya sendiri",
              "BUSINESS_RULE_VIOLATION",
            );
          }

          if (existing.isActive) {
            const activeAdmins = await tx
              .select({ id: users.id })
              .from(users)
              .where(
                and(eq(users.role, "admin"), eq(users.isActive, true)),
              )
              .for("update");

            if (activeAdmins.length <= 1) {
              throw new BusinessRuleError(
                "Admin aktif terakhir tidak boleh kehilangan role Admin",
                "BUSINESS_RULE_VIOLATION",
              );
            }
          }
        }

        try {
          const updatedRows = await tx
            .update(users)
            .set({
              name: changes.name ?? existing.name,
              email: changes.email ?? existing.email,
              role: changes.role ?? existing.role,
              updatedAt: new Date(),
            })
            .where(eq(users.id, id))
            .returning();

          const updated = updatedRows[0];
          if (!updated) {
            throw new NotFoundError("Pengguna tidak ditemukan");
          }
          return updated;
        } catch (error) {
          if (isUniqueViolation(error, "users_email_normalized_uidx")) {
            throw new ConflictError("Email sudah digunakan", "DUPLICATE_EMAIL");
          }
          throw error;
        }
      });
    },

    async updateUserStatusInTx({
      id,
      actorUserId,
      isActive,
      revokeSessions,
    }): Promise<UserRow> {
      return db.transaction(async (tx) => {
        const targetRows = await tx
          .select()
          .from(users)
          .where(eq(users.id, id))
          .for("update");

        const existing = targetRows[0];
        if (!existing) {
          throw new NotFoundError("Pengguna tidak ditemukan");
        }

        if (existing.isActive === isActive) {
          return existing;
        }

        if (!isActive) {
          if (existing.id === actorUserId) {
            throw new BusinessRuleError(
              "Admin tidak boleh menonaktifkan dirinya sendiri",
              "BUSINESS_RULE_VIOLATION",
            );
          }

          if (existing.role === "admin") {
            const activeAdmins = await tx
              .select({ id: users.id })
              .from(users)
              .where(
                and(eq(users.role, "admin"), eq(users.isActive, true)),
              )
              .for("update");

            if (activeAdmins.length <= 1) {
              throw new BusinessRuleError(
                "Admin aktif terakhir tidak boleh dinonaktifkan",
                "BUSINESS_RULE_VIOLATION",
              );
            }
          }
        }

        const updatedRows = await tx
          .update(users)
          .set({
            isActive,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id))
          .returning();

        const updated = updatedRows[0];
        if (!updated) {
          throw new NotFoundError("Pengguna tidak ditemukan");
        }

        if (!isActive) {
          await revokeSessions(id, tx);
        }

        return updated;
      });
    },

    async resetPasswordInTx({
      id,
      passwordHash,
      revokeSessions,
    }): Promise<void> {
      await db.transaction(async (tx) => {
        const targetRows = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, id))
          .for("update");

        if (!targetRows[0]) {
          throw new NotFoundError("Pengguna tidak ditemukan");
        }

        await tx
          .update(users)
          .set({
            passwordHash,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));

        await revokeSessions(id, tx);
      });
    },
  };
}
