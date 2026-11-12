import {
  InvalidCredentialsError,
  RateLimitExceededError,
} from "../../common/errors";
import {
  generateSessionToken,
  hashSessionToken,
  normalizeEmail,
} from "../../common/security";
import type { BackendEnv } from "../../config/env";
import type { LoginRateLimiter } from "./auth.rate-limiter";
import type { AuthRepository } from "./auth.repository";
import type {
  AuthContextUser,
  LoginInput,
  LoginResult,
} from "./auth.types";

const MILLISECONDS_PER_DAY = 86_400_000;

let dummyPasswordHashPromise: Promise<string> | null = null;

function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = Bun.password.hash(
      `dummy-${crypto.randomUUID()}`,
      { algorithm: "argon2id" },
    );
  }
  return dummyPasswordHashPromise;
}

export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>;
  authenticateSession(rawToken: string): Promise<AuthContextUser | null>;
  logout(sessionId: string): Promise<void>;
}

export interface CreateAuthServiceDeps {
  repository: AuthRepository;
  rateLimiter: LoginRateLimiter;
  env: Pick<BackendEnv, "SESSION_TTL_DAYS">;
}

/**
 * Creates the authentication and session management service.
 */
export function createAuthService(deps: CreateAuthServiceDeps): AuthService {
  const { repository, rateLimiter, env } = deps;

  return {
    async login(input: LoginInput): Promise<LoginResult> {
      const normalizedEmail = normalizeEmail(input.email);
      const rateLimit = rateLimiter.consume(input.clientIp, normalizedEmail);
      if (!rateLimit.allowed) {
        throw new RateLimitExceededError(rateLimit.retryAfterSeconds);
      }

      const user = await repository.findUserByEmail(normalizedEmail);
      const hashToVerify = user
        ? user.passwordHash
        : await getDummyPasswordHash();

      const passwordMatches = await Bun.password.verify(
        input.password,
        hashToVerify,
      );

      if (!user || !passwordMatches || !user.isActive) {
        throw new InvalidCredentialsError("Email atau kata sandi salah");
      }

      const rawSessionToken = generateSessionToken(32);
      const tokenHash = hashSessionToken(rawSessionToken);
      const expiresAt = new Date(
        Date.now() + env.SESSION_TTL_DAYS * MILLISECONDS_PER_DAY,
      );

      await repository.createSession({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        rawSessionToken,
        expiresAt,
      };
    },

    async authenticateSession(
      rawToken: string,
    ): Promise<AuthContextUser | null> {
      const trimmed = rawToken.trim();
      if (!trimmed || trimmed.length > 512) {
        return null;
      }

      const tokenHash = hashSessionToken(trimmed);
      const activeSession =
        await repository.findActiveSessionByTokenHash(tokenHash);
      if (!activeSession) {
        return null;
      }

      return {
        ...activeSession.user,
        sessionId: activeSession.sessionId,
      };
    },

    async logout(sessionId: string): Promise<void> {
      await repository.revokeSessionById(sessionId);
    },
  };
}
