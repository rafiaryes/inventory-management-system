import { t } from "elysia";
import { ValidationError } from "../../common/errors";
import { createPaginatedSchema, createSuccessSchema } from "../../common/http";
import { parseBaseListQuery, parseBooleanParam } from "../../common/pagination";
import { USER_ROLES, type UserRole } from "../../db/schema";
import {
  USER_SORT_FIELDS,
  type ListUsersQuery,
  type UserSortField,
} from "./users.types";

export const userIdParamSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const userDtoSchema = t.Object({
  id: t.String({ format: "uuid" }),
  name: t.String(),
  email: t.String({ format: "email" }),
  role: t.Union([t.Literal("admin"), t.Literal("staff")]),
  isActive: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

export const listUsersQuerySchema = t.Object({
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  search: t.Optional(t.String()),
  role: t.Optional(t.String()),
  isActive: t.Optional(t.String()),
  sortBy: t.Optional(t.String()),
  sortOrder: t.Optional(t.String()),
});

export const createUserBodySchema = t.Object(
  {
    name: t.String({ minLength: 1, maxLength: 150 }),
    email: t.String({ minLength: 1, maxLength: 255, format: "email" }),
    password: t.String({ minLength: 8, maxLength: 128 }),
    role: t.Union([t.Literal("admin"), t.Literal("staff")]),
  },
  { additionalProperties: false },
);

export const updateUserBodySchema = t.Object(
  {
    name: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
    email: t.Optional(
      t.String({ minLength: 1, maxLength: 255, format: "email" }),
    ),
    role: t.Optional(t.Union([t.Literal("admin"), t.Literal("staff")])),
  },
  { additionalProperties: false },
);

export const updateUserStatusBodySchema = t.Object(
  {
    isActive: t.Boolean(),
  },
  { additionalProperties: false },
);

export const resetUserPasswordBodySchema = t.Object(
  {
    newPassword: t.String({ minLength: 8, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export const userListResponseSchema = createPaginatedSchema(userDtoSchema);
export const userDetailResponseSchema = createSuccessSchema(userDtoSchema);
export const resetUserPasswordResponseSchema = createSuccessSchema(t.Null());

const USER_SORT_FIELD_SET = new Set<string>(USER_SORT_FIELDS);
const USER_ROLE_SET = new Set<string>(USER_ROLES);

/**
 * Parses and validates query parameters for `GET /api/v1/users`.
 */
export function parseListUsersQuery(raw: {
  page?: string;
  pageSize?: string;
  search?: string;
  role?: string;
  isActive?: string;
  sortBy?: string;
  sortOrder?: string;
}): ListUsersQuery {
  const base = parseBaseListQuery(raw);

  let role: UserRole | undefined;
  if (raw.role !== undefined) {
    if (!USER_ROLE_SET.has(raw.role)) {
      throw new ValidationError("Filter role tidak valid", [
        { field: "role", message: "role harus bernilai 'admin' atau 'staff'" },
      ]);
    }
    role = raw.role as UserRole;
  }

  const isActive = parseBooleanParam(raw.isActive, "isActive");

  let sortBy: UserSortField = "createdAt";
  if (raw.sortBy !== undefined) {
    if (!USER_SORT_FIELD_SET.has(raw.sortBy)) {
      throw new ValidationError("Parameter sortBy tidak valid", [
        {
          field: "sortBy",
          message: `sortBy harus salah satu dari: ${USER_SORT_FIELDS.join(", ")}`,
        },
      ]);
    }
    sortBy = raw.sortBy as UserSortField;
  }

  return {
    ...base,
    role,
    isActive,
    sortBy,
  };
}

/**
 * Trims editable string fields (`name`, `email`) prior to Elysia schema validation.
 */
export function trimUserBodyStrings(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name === "string") {
    record.name = record.name.trim();
  }
  if (typeof record.email === "string") {
    record.email = record.email.trim();
  }
}

/**
 * Ensures password input contains non-whitespace characters (`400 VALIDATION_ERROR`).
 */
export function assertPasswordNotBlank(
  password: string,
  fieldName: string,
): void {
  if (password.trim().length === 0) {
    throw new ValidationError("Kata sandi tidak valid", [
      {
        field: fieldName,
        message: `${fieldName} tidak boleh hanya berisi spasi`,
      },
    ]);
  }
}
