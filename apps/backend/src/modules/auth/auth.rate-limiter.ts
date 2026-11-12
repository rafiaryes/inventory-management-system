export interface LoginRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimiter {
  consume(clientIp: string | null, normalizedEmail: string): LoginRateLimitResult;
  size(): number;
  reset(): void;
}

export interface CreateLoginRateLimiterOptions {
  maxAttempts: number;
  windowSeconds: number;
  maxBuckets?: number;
  now?: () => number;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

const DEFAULT_MAX_BUCKETS = 10_000;
const PRUNE_THRESHOLD = 1000;

/**
 * Creates a bounded in-memory fixed-window rate limiter tracking both IP and IP+email keys.
 */
export function createLoginRateLimiter(
  options: CreateLoginRateLimiterOptions,
): LoginRateLimiter {
  const maxBuckets = options.maxBuckets ?? DEFAULT_MAX_BUCKETS;
  if (!Number.isInteger(maxBuckets) || maxBuckets < 2) {
    throw new Error(
      `Invalid maxBuckets "${String(maxBuckets)}": must be an integer >= 2`,
    );
  }

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
    // Refresh insertion order (LRU) so active buckets are retained over stale flood keys.
    buckets.delete(key);
    buckets.set(key, existing);
    return existing;
  }

  function pruneExpiredBuckets(currentMs: number): void {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAtMs <= currentMs) {
        buckets.delete(key);
      }
    }
  }

  function evictOneBucket(): void {
    // Protect actively blocked buckets against flood eviction by evicting the oldest
    // non-blocked (low-attempt) bucket first.
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.count < options.maxAttempts) {
        buckets.delete(key);
        return;
      }
    }

    // If every bucket in memory is currently blocked, evict the earliest-expiring blocked bucket.
    let earliestKey: string | undefined;
    let earliestResetAtMs = Infinity;
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAtMs < earliestResetAtMs) {
        earliestResetAtMs = bucket.resetAtMs;
        earliestKey = key;
      }
    }
    if (earliestKey !== undefined) {
      buckets.delete(earliestKey);
    }
  }

  function ensureCapacity(currentMs: number): void {
    if (buckets.size < maxBuckets) {
      return;
    }

    pruneExpiredBuckets(currentMs);

    while (buckets.size >= maxBuckets) {
      const sizeBefore = buckets.size;
      evictOneBucket();
      if (buckets.size >= sizeBefore) {
        break;
      }
    }
  }

  function incrementBucket(key: string, currentMs: number): void {
    const existing = getActiveBucket(key, currentMs);
    if (!existing) {
      ensureCapacity(currentMs);
      buckets.set(key, {
        count: 1,
        resetAtMs: currentMs + windowMs,
      });
      return;
    }
    existing.count += 1;
  }

  return {
    consume(
      clientIp: string | null,
      normalizedEmail: string,
    ): LoginRateLimitResult {
      const currentMs = now();
      if (buckets.size > PRUNE_THRESHOLD) {
        pruneExpiredBuckets(currentMs);
      }

      if (clientIp === null) {
        // Never collapse unavailable socket IPs into a shared "ip:unknown" DoS bucket;
        // enforce per-account brute-force protection via an isolated email key instead.
        const emailKey = `email-no-ip:${normalizedEmail}`;
        const emailBucket = getActiveBucket(emailKey, currentMs);
        if (emailBucket !== null && emailBucket.count >= options.maxAttempts) {
          const retryMs = Math.max(0, emailBucket.resetAtMs - currentMs);
          return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
          };
        }
        incrementBucket(emailKey, currentMs);
        return {
          allowed: true,
          retryAfterSeconds: 0,
        };
      }

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
    size(): number {
      return buckets.size;
    },
    reset(): void {
      buckets.clear();
    },
  };
}
