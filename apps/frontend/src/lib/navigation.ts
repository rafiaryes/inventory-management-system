/**
 * Ensures redirect `next` parameters stay within internal application routes (prevents open redirects).
 */
export function sanitizeNextPath(
  rawNext: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!rawNext) {
    return fallback;
  }

  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  if (trimmed === "/" || trimmed.startsWith("/login")) {
    return fallback;
  }

  return trimmed;
}
