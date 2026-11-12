const MIN_SESSION_TOKEN_BYTES = 32;

/**
 * Generates an opaque, cryptographically random session token encoded in base64url.
 */
export function generateSessionToken(
  byteLength = MIN_SESSION_TOKEN_BYTES,
): string {
  if (!Number.isInteger(byteLength) || byteLength < MIN_SESSION_TOKEN_BYTES) {
    throw new Error(
      `Session token must contain at least ${MIN_SESSION_TOKEN_BYTES} bytes of entropy`,
    );
  }

  const randomBytes = new Uint8Array(byteLength);
  crypto.getRandomValues(randomBytes);
  return Buffer.from(randomBytes).toString("base64url");
}

/**
 * Computes the 64-character lowercase hexadecimal SHA-256 digest of a raw session token.
 */
export function hashSessionToken(rawToken: string): string {
  return new Bun.CryptoHasher("sha256").update(rawToken).digest("hex");
}

/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  return trimmed;
}

/**
 * Extracts a normalized client IP address, preferring the socket IP when available.
 */
export function extractClientIp(
  request: Request,
  socketIp?: string | null,
): string {
  if (socketIp && socketIp.trim().length > 0) {
    return normalizeIp(socketIp);
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstHop = forwardedFor.split(",")[0]?.trim();
    if (firstHop) {
      return normalizeIp(firstHop);
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return normalizeIp(realIp);
  }

  return "unknown";
}

/**
 * Redacts connection strings, cookie values, and secret-like assignments before logging.
 */
export function redactSensitiveText(input: string): string {
  return input
    .replace(
      /postgres(?:ql)?:\/\/[^\s"'`]+/gi,
      "postgresql://[REDACTED]",
    )
    .replace(
      /(cookie|set-cookie|authorization)\s*[:=]\s*[^\r\n;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /(password(?:_hash)?|token(?:_hash)?|secret)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    );
}

/**
 * Produces a log-safe representation of an unexpected error without exposing raw secrets.
 */
export function formatUnexpectedErrorForLog(error: unknown): {
  name: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
    };
  }

  return {
    name: "UnknownError",
    message: redactSensitiveText(String(error)),
  };
}
