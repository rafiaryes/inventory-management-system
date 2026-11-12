"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError, setUnauthorizedHandler } from "@/lib/api-client";
import { authService } from "@/services/auth.service";
import type { AuthUser, LoginPayload } from "@/types/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  sessionError: string | null;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthUser | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hydrates and manages client auth state backed by HttpOnly session cookies (`/api/v1/auth/me`).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    setSessionError(null);
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setStatus(currentUser ? "authenticated" : "unauthenticated");
      return currentUser;
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : "Gagal memeriksa status sesi pengguna.";
      setUser(null);
      setStatus("unauthenticated");
      setSessionError(message);
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("unauthenticated");
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function hydrate() {
      try {
        const currentUser = await authService.getCurrentUser(controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setUser(currentUser);
        setStatus(currentUser ? "authenticated" : "unauthenticated");
        setSessionError(null);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        const message =
          error instanceof ApiClientError
            ? error.message
            : "Gagal memeriksa status sesi pengguna.";
        setUser(null);
        setStatus("unauthenticated");
        setSessionError(message);
      }
    }

    void hydrate();

    return () => {
      controller.abort();
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<AuthUser> => {
    const loggedInUser = await authService.login(payload);
    setUser(loggedInUser);
    setStatus("authenticated");
    setSessionError(null);
    return loggedInUser;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      setSessionError(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      sessionError,
      login,
      logout,
      refreshSession,
    }),
    [user, status, sessionError, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
