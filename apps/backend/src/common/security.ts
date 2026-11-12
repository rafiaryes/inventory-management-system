import { isIP } from "node:net";

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
  if (/^::ffff:/i.test(trimmed)) {
    const suffix = trimmed.slice("::ffff:".length);
    if (isIP(suffix) === 4) {
      return suffix;
    }
  }
  return trimmed.toLowerCase();
}

export interface ExtractClientIpOptions {
  socketIp?: string | null;
  trustedProxyIps?: readonly string[];
}

export interface TrustedProxyRule {
  raw: string;
  family: 4 | 6;
  network: bigint;
  mask: bigint;
}

function parseIpv4ToBigInt(ip: string): bigint {
  const octets = ip.split(".");
  if (octets.length !== 4) {
    throw new Error(`Invalid IPv4 address "${ip}"`);
  }
  let value = 0n;
  for (const octet of octets) {
    value = (value << 8n) | BigInt(Number(octet));
  }
  return value;
}

function parseIpv6ToBigInt(ip: string): bigint {
  let target = ip;
  if (target.includes(".")) {
    const lastColonIdx = target.lastIndexOf(":");
    if (lastColonIdx === -1) {
      throw new Error(`Invalid IPv6 address "${ip}"`);
    }
    const ipv4Part = target.slice(lastColonIdx + 1);
    if (isIP(ipv4Part) !== 4) {
      throw new Error(`Invalid embedded IPv4 in IPv6 address "${ip}"`);
    }
    const ipv4Int = parseIpv4ToBigInt(ipv4Part);
    const high = Number((ipv4Int >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4Int & 0xffffn).toString(16);
    target = `${target.slice(0, lastColonIdx)}:${high}:${low}`;
  }

  const doubleColonParts = target.split("::");
  if (doubleColonParts.length > 2) {
    throw new Error(`Invalid IPv6 address "${ip}"`);
  }

  const left =
    doubleColonParts[0] && doubleColonParts[0].length > 0
      ? doubleColonParts[0].split(":")
      : [];
  const right =
    doubleColonParts.length === 2 &&
    doubleColonParts[1] &&
    doubleColonParts[1].length > 0
      ? doubleColonParts[1].split(":")
      : [];

  const zeroFillCount =
    doubleColonParts.length === 2 ? 8 - (left.length + right.length) : 0;
  if (zeroFillCount < 0) {
    throw new Error(`Invalid IPv6 address "${ip}"`);
  }

  const groups = [
    ...left,
    ...Array<string>(zeroFillCount).fill("0"),
    ...right,
  ];
  if (groups.length !== 8) {
    throw new Error(`Invalid IPv6 address "${ip}"`);
  }

  let value = 0n;
  for (const group of groups) {
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function parseIpValue(
  normalizedIp: string,
): { family: 4 | 6; value: bigint } | null {
  if (!normalizedIp || normalizedIp.includes("%") || /\s/.test(normalizedIp)) {
    return null;
  }
  const family = isIP(normalizedIp);
  if (family === 4) {
    return { family: 4, value: parseIpv4ToBigInt(normalizedIp) };
  }
  if (family === 6) {
    return { family: 6, value: parseIpv6ToBigInt(normalizedIp) };
  }
  return null;
}

export function normalizeValidIp(
  rawIp: string | null | undefined,
): string | null {
  if (!rawIp) {
    return null;
  }
  const normalized = normalizeIp(rawIp);
  if (!parseIpValue(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Parses and validates a trusted proxy IPv4/IPv6 address or CIDR range.
 */
export function parseTrustedProxyCidr(rawEntry: string): TrustedProxyRule {
  const trimmed = rawEntry.trim();
  if (!trimmed) {
    throw new Error("TRUSTED_PROXY_IPS cannot contain empty entries");
  }

  const slashIdx = trimmed.indexOf("/");
  const hasMask = slashIdx !== -1;
  const rawAddr = hasMask ? trimmed.slice(0, slashIdx).trim() : trimmed;
  const normalizedAddr = normalizeValidIp(rawAddr);
  if (!normalizedAddr) {
    throw new Error(`Invalid TRUSTED_PROXY_IPS entry "${rawEntry}"`);
  }

  const parsedAddr = parseIpValue(normalizedAddr);
  if (!parsedAddr) {
    throw new Error(`Invalid TRUSTED_PROXY_IPS entry "${rawEntry}"`);
  }

  const maxPrefix = parsedAddr.family === 4 ? 32 : 128;
  let prefix = maxPrefix;
  if (hasMask) {
    const rawPrefix = trimmed.slice(slashIdx + 1).trim();
    if (!/^\d+$/.test(rawPrefix)) {
      throw new Error(
        `Invalid CIDR prefix in TRUSTED_PROXY_IPS entry "${rawEntry}"`,
      );
    }
    prefix = Number(rawPrefix);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      throw new Error(
        `CIDR prefix out of range in TRUSTED_PROXY_IPS entry "${rawEntry}"`,
      );
    }
  }

  const bitWidth = BigInt(maxPrefix);
  const shift = BigInt(maxPrefix - prefix);
  const fullMask = (1n << bitWidth) - 1n;
  const mask = prefix === 0 ? 0n : fullMask ^ ((1n << shift) - 1n);

  return {
    raw: hasMask ? `${normalizedAddr}/${prefix}` : normalizedAddr,
    family: parsedAddr.family,
    network: parsedAddr.value & mask,
    mask,
  };
}

const compiledRulesCache = new WeakMap<
  readonly string[],
  readonly TrustedProxyRule[]
>();

function getCompiledTrustedProxyRules(
  trustedProxyIps: readonly string[],
): readonly TrustedProxyRule[] {
  const cached = compiledRulesCache.get(trustedProxyIps);
  if (cached) {
    return cached;
  }
  const compiled = trustedProxyIps.map((entry) => parseTrustedProxyCidr(entry));
  compiledRulesCache.set(trustedProxyIps, compiled);
  return compiled;
}

export function isIpInTrustedProxies(
  ip: string,
  trustedRules: readonly TrustedProxyRule[],
): boolean {
  const parsed = parseIpValue(ip);
  if (!parsed) {
    return false;
  }
  for (const rule of trustedRules) {
    if (
      rule.family === parsed.family &&
      (parsed.value & rule.mask) === rule.network
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts a verified client IP address using trusted proxy CIDR matching and
 * right-to-left `X-Forwarded-For` traversal.
 *
 * Returns `null` when no valid socket peer IP is available (forwarded headers are
 * never trusted without a verified socket peer).
 */
export function extractClientIp(
  request: Request,
  options: ExtractClientIpOptions = {},
): string | null {
  const peerIp = normalizeValidIp(options.socketIp);
  if (!peerIp) {
    return null;
  }

  const trustedRules = getCompiledTrustedProxyRules(
    options.trustedProxyIps ?? [],
  );
  if (trustedRules.length === 0 || !isIpInTrustedProxies(peerIp, trustedRules)) {
    return peerIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor !== null && forwardedFor.trim().length > 0) {
    const hops = forwardedFor.split(",");
    let earliestTrustedHop: string | null = null;

    for (let i = hops.length - 1; i >= 0; i--) {
      const hopIp = normalizeValidIp(hops[i]);
      if (!hopIp) {
        // Malformed or empty hop along the trusted chain: stop safely without trusting further left.
        return peerIp;
      }

      if (!isIpInTrustedProxies(hopIp, trustedRules)) {
        return hopIp;
      }

      earliestTrustedHop = hopIp;
    }

    return earliestTrustedHop ?? peerIp;
  }

  const realIp = normalizeValidIp(request.headers.get("x-real-ip"));
  if (realIp) {
    return realIp;
  }

  return peerIp;
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
