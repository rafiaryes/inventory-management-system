import { ValidationError } from "./errors";

const ISO_DATETIME_WITH_TZ_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function readZonedParts(
  instantMs: number,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(instantMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }

  return {
    year: map.year!,
    month: map.month!,
    day: map.day!,
    hour: map.hour === 24 ? 0 : map.hour!,
    minute: map.minute!,
    second: map.second!,
  };
}

function zonedMidnightToUtcDate(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const targetWallMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  const firstParts = readZonedParts(targetWallMs, timeZone);
  const firstObservedWallMs = Date.UTC(
    firstParts.year,
    firstParts.month - 1,
    firstParts.day,
    firstParts.hour,
    firstParts.minute,
    firstParts.second,
  );
  const candidateMs = targetWallMs - (firstObservedWallMs - targetWallMs);

  const secondParts = readZonedParts(candidateMs, timeZone);
  const secondObservedWallMs = Date.UTC(
    secondParts.year,
    secondParts.month - 1,
    secondParts.day,
    secondParts.hour,
    secondParts.minute,
    secondParts.second,
  );
  const finalMs = candidateMs - (secondObservedWallMs - targetWallMs);

  return new Date(finalMs);
}

/**
 * Computes `[startUtc, endUtc)` boundaries for the current calendar month in `timeZone`.
 */
export function getCalendarMonthRangeUtc(
  timeZone: string,
  referenceInstant: Date = new Date(),
): { startUtc: Date; endUtc: Date } {
  const zonedNow = readZonedParts(referenceInstant.getTime(), timeZone);
  const nextMonth = zonedNow.month === 12 ? 1 : zonedNow.month + 1;
  const nextYear = zonedNow.month === 12 ? zonedNow.year + 1 : zonedNow.year;

  return {
    startUtc: zonedMidnightToUtcDate(zonedNow.year, zonedNow.month, 1, timeZone),
    endUtc: zonedMidnightToUtcDate(nextYear, nextMonth, 1, timeZone),
  };
}

/**
 * Strictly parses an ISO 8601 datetime string with explicit timezone (`Z` or `±HH:MM`).
 */
export function parseIsoDateTimeWithTimezone(
  rawValue: string | undefined,
  field: string,
): Date | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  const match = ISO_DATETIME_WITH_TZ_PATTERN.exec(trimmed);
  if (!match) {
    throw new ValidationError("Format tanggal dan waktu tidak valid", [
      {
        field,
        message: `${field} harus menggunakan format ISO 8601 lengkap dengan timezone (contoh: 2026-11-12T00:00:00.000Z atau 2026-11-12T00:00:00+07:00)`,
      },
    ]);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const tzPart = match[7]!;

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError("Nilai tanggal atau waktu tidak valid", [
      { field, message: `${field} memuat komponen tanggal/waktu yang tidak valid` },
    ]);
  }

  if (tzPart !== "Z") {
    const [offsetHourStr, offsetMinStr] = tzPart.slice(1).split(":");
    const offsetHour = Number(offsetHourStr);
    const offsetMin = Number(offsetMinStr);
    if (offsetHour > 23 || offsetMin > 59) {
      throw new ValidationError("Offset timezone tidak valid", [
        { field, message: `${field} memuat offset timezone yang tidak valid` },
      ]);
    }
  }

  // Verify calendar rollover (e.g., 2026-02-30 does not roll over to March)
  const utcCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    utcCheck.getUTCFullYear() !== year ||
    utcCheck.getUTCMonth() !== month - 1 ||
    utcCheck.getUTCDate() !== day
  ) {
    throw new ValidationError("Tanggal kalender tidak valid", [
      { field, message: `${field} bukan tanggal kalender yang valid` },
    ]);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Format tanggal dan waktu tidak valid", [
      { field, message: `${field} gagal diparsing sebagai datetime ISO 8601` },
    ]);
  }

  return parsed;
}
