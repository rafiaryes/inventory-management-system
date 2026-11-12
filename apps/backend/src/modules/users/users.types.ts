import type { SortOrder } from "../../common/pagination";
import type { UserRole } from "../../db/schema";

export const USER_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "email",
  "role",
  "isActive",
] as const;

export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersQuery {
  page: number;
  pageSize: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  sortBy: UserSortField;
  sortOrder: SortOrder;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
}
