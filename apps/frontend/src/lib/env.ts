const DEFAULT_API_BASE_URL = "http://localhost:3001/api/v1";

function normalizeApiBaseUrl(rawUrl: string | undefined): string {
  const candidate = (rawUrl ?? DEFAULT_API_BASE_URL).trim();
  if (!candidate) {
    return DEFAULT_API_BASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_API_BASE_URL: "${candidate}". Expected an http:// or https:// URL.`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid NEXT_PUBLIC_API_BASE_URL protocol "${parsed.protocol}". Expected http: or https:.`,
    );
  }

  return candidate.replace(/\/+$/, "");
}

export const frontendEnv = {
  apiBaseUrl: normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
} as const;
