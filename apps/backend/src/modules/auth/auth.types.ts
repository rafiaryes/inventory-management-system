import type { UserRole } from "../../db/schema";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthContextUser extends AuthenticatedUser {
  sessionId: string;
}

export interface UserAuthRecord extends AuthenticatedUser {
  passwordHash: string;
  isActive: boolean;
}

export interface ActiveSessionRecord {
  sessionId: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

export interface LoginInput {
  email: string;
  password: string;
  clientIp: string | null;
}

export interface LoginResult {
  user: AuthenticatedUser;
  rawSessionToken: string;
  expiresAt: Date;
}
