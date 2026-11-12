import { NotFoundError, ValidationError } from "../../common/errors";
import type { PaginationMeta } from "../../common/http";
import { buildPaginationMeta } from "../../common/pagination";
import { normalizeEmail } from "../../common/security";
import type { UserRow } from "../../db/schema";
import type { AuthRepository } from "../auth/auth.repository";
import type { UsersRepository } from "./users.repository";
import { assertPasswordNotBlank } from "./users.schema";
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UserDto,
} from "./users.types";

function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UsersService {
  listUsers(
    query: ListUsersQuery,
  ): Promise<{ items: UserDto[]; meta: PaginationMeta }>;
  getUserById(id: string): Promise<UserDto>;
  createUser(input: CreateUserInput): Promise<UserDto>;
  updateUser(
    id: string,
    actorUserId: string,
    input: UpdateUserInput,
  ): Promise<UserDto>;
  updateUserStatus(
    id: string,
    actorUserId: string,
    isActive: boolean,
  ): Promise<UserDto>;
  resetUserPassword(id: string, newPassword: string): Promise<void>;
}

export interface CreateUsersServiceDeps {
  repository: UsersRepository;
  authRepository: Pick<AuthRepository, "revokeAllSessionsForUser">;
}

/**
 * Creates the business service layer for Admin user management.
 */
export function createUsersService(deps: CreateUsersServiceDeps): UsersService {
  const { repository, authRepository } = deps;

  return {
    async listUsers(
      query: ListUsersQuery,
    ): Promise<{ items: UserDto[]; meta: PaginationMeta }> {
      const { items, totalItems } = await repository.findMany(query);
      return {
        items: items.map(toUserDto),
        meta: buildPaginationMeta(query.page, query.pageSize, totalItems),
      };
    },

    async getUserById(id: string): Promise<UserDto> {
      const user = await repository.findById(id);
      if (!user) {
        throw new NotFoundError("Pengguna tidak ditemukan");
      }
      return toUserDto(user);
    },

    async createUser(input: CreateUserInput): Promise<UserDto> {
      assertPasswordNotBlank(input.password, "password");

      const normalizedName = input.name.trim();
      const normalizedEmail = normalizeEmail(input.email);
      const passwordHash = await Bun.password.hash(input.password, {
        algorithm: "argon2id",
      });

      const created = await repository.create({
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        role: input.role,
      });

      return toUserDto(created);
    },

    async updateUser(
      id: string,
      actorUserId: string,
      input: UpdateUserInput,
    ): Promise<UserDto> {
      const hasChanges =
        input.name !== undefined ||
        input.email !== undefined ||
        input.role !== undefined;

      if (!hasChanges) {
        throw new ValidationError(
          "Minimal satu field harus dikirim untuk pembaruan",
        );
      }

      const changes: UpdateUserInput = {
        name: input.name !== undefined ? input.name.trim() : undefined,
        email:
          input.email !== undefined ? normalizeEmail(input.email) : undefined,
        role: input.role,
      };

      const updated = await repository.updateUserInTx({
        id,
        actorUserId,
        changes,
      });

      return toUserDto(updated);
    },

    async updateUserStatus(
      id: string,
      actorUserId: string,
      isActive: boolean,
    ): Promise<UserDto> {
      const updated = await repository.updateUserStatusInTx({
        id,
        actorUserId,
        isActive,
        revokeSessions: authRepository.revokeAllSessionsForUser,
      });

      return toUserDto(updated);
    },

    async resetUserPassword(id: string, newPassword: string): Promise<void> {
      assertPasswordNotBlank(newPassword, "newPassword");

      const existing = await repository.findById(id);
      if (!existing) {
        throw new NotFoundError("Pengguna tidak ditemukan");
      }

      const passwordHash = await Bun.password.hash(newPassword, {
        algorithm: "argon2id",
      });

      await repository.resetPasswordInTx({
        id,
        passwordHash,
        revokeSessions: authRepository.revokeAllSessionsForUser,
      });
    },
  };
}
