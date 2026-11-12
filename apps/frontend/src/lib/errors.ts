import { ApiClientError } from "@/lib/api-client";

/**
 * Extracts a clear user-facing Indonesian message (including validation field details) from API errors.
 */
export function extractErrorMessage(
  error: unknown,
  fallback = "Terjadi kesalahan saat memproses permintaan.",
): string {
  if (error instanceof ApiClientError) {
    if (error.details && error.details.length > 0) {
      const detailMessages = error.details.map((d) => d.message).join(" ");
      return `${error.message} ${detailMessages}`.trim();
    }
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
