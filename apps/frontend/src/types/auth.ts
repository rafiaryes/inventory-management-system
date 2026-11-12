export type UserRole = "admin" | "staff";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthUserData {
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}
