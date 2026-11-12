export interface LoginRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimiter {
  consume(clientIp: string, normalizedEmail: string): LoginRateLimitResult;
  reset(): void;
}

export interface CreateLoginRateLimiterOptions {
  maxAttempts: number;
  windowSeconds: number;
  now?: () => number;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

const PRUNE_THRESHOLD = 1000;

/**
 * Creates an in-memory fixed-window rate limiter tracking both IP and IP+email keys.
 */
export function createLoginRateLimiter(
  options: CreateLoginRateLimiterOptions,
): LoginRateLimiter {
  const windowMs = options.windowSeconds * 1000;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, RateLimitBucket>();

  function getActiveBucket(key: string, currentMs: number): RateLimitBucket | null {
    const existing = buckets.get(key);
    if (!existing) {
      return null;
    }
    if (existing.resetAtMs <= currentMs) {
      buckets.delete(key);
      return null;
    }
    return existing;
  }

  function incrementBucket(key: string, currentMs: number): void {
    const existing = getActiveBucket(key, currentMs);
    if (!existing) {
      buckets.set(key, {
        count: 1,
        resetAtMs: currentMs + windowMs,
      });
      return;
    }
    existing.count += 1;
  }

  function pruneExpiredBuckets(currentMs: number): void {
    if (buckets.size <= PRUNE_THRESHOLD) {
      return;
    }
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAtMs <= currentMs) {
        buckets.delete(key);
      }
    }
  }

  return {
    consume(clientIp: string, normalizedEmail: string): LoginRateLimitResult {
      const currentMs = now();
      pruneExpiredBuckets(currentMs);

      const ipKey = `ip:${clientIp}`;
      const ipEmailKey = `ip-email:${clientIp}:${normalizedEmail}`;

      const ipBucket = getActiveBucket(ipKey, currentMs);
      const ipEmailBucket = getActiveBucket(ipEmailKey, currentMs);

      const ipExceeded =
        ipBucket !== null && ipBucket.count >= options.maxAttempts;
      const ipEmailExceeded =
        ipEmailBucket !== null && ipEmailBucket.count >= options.maxAttempts;

      if (ipExceeded || ipEmailExceeded) {
        const retryMs = Math.max(
          ipExceeded && ipBucket ? ipBucket.resetAtMs - currentMs : 0,
          ipEmailExceeded && ipEmailBucket
            ? ipEmailBucket.resetAtMs - currentMs
            : 0,
        );
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
        };
      }

      incrementBucket(ipKey, currentMs);
      incrementBucket(ipEmailKey, currentMs);

      return {
        allowed: true,
        retryAfterSeconds: 0,
      };
    },
    reset(): void {
      buckets.clear();
    },
  };
}
