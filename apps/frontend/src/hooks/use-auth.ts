"use client";

import { useContext } from "react";
import {
  AuthContext,
  type AuthContextValue,
} from "@/components/auth/auth-provider";

/**
 * Returns the active authentication state and session actions inside `<AuthProvider>`.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
