import { describe, expect, test } from "bun:test";
import { ValidationError } from "../src/common/errors";
import {
  getCalendarMonthRangeUtc,
  parseIsoDateTimeWithTimezone,
} from "../src/common/timezone";

describe("timezone helpers", () => {
  test("computes calendar month UTC boundaries for Asia/Jakarta", () => {
    const octoberRange = getCalendarMonthRangeUtc(
      "Asia/Jakarta",
      new Date("2026-10-15T10:00:00.000Z"),
    );

    expect(octoberRange.startUtc.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(octoberRange.endUtc.toISOString()).toBe("2026-10-31T17:00:00.000Z");

    const beforeJakartaMidnight = getCalendarMonthRangeUtc(
      "Asia/Jakarta",
      new Date("2026-10-31T16:59:59.999Z"),
    );
    expect(beforeJakartaMidnight.startUtc.toISOString()).toBe(
      "2026-09-30T17:00:00.000Z",
    );
    expect(beforeJakartaMidnight.endUtc.toISOString()).toBe(
      "2026-10-31T17:00:00.000Z",
    );

    const atJakartaMidnight = getCalendarMonthRangeUtc(
      "Asia/Jakarta",
      new Date("2026-10-31T17:00:00.000Z"),
    );
    expect(atJakartaMidnight.startUtc.toISOString()).toBe(
      "2026-10-31T17:00:00.000Z",
    );
    expect(atJakartaMidnight.endUtc.toISOString()).toBe(
      "2026-11-30T17:00:00.000Z",
    );

    const decemberRange = getCalendarMonthRangeUtc(
      "Asia/Jakarta",
      new Date("2026-12-20T00:00:00.000Z"),
    );
    expect(decemberRange.startUtc.toISOString()).toBe(
      "2026-11-30T17:00:00.000Z",
    );
    expect(decemberRange.endUtc.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  test("strictly parses ISO 8601 datetimes with explicit timezone and rejects invalid inputs", () => {
    expect(parseIsoDateTimeWithTimezone(undefined, "startDate")).toBeUndefined();

    expect(
      parseIsoDateTimeWithTimezone("2026-11-01T00:00:00Z", "startDate")?.toISOString(),
    ).toBe("2026-11-01T00:00:00.000Z");

    expect(
      parseIsoDateTimeWithTimezone(
        "2026-11-01T00:00:00+07:00",
        "startDate",
      )?.toISOString(),
    ).toBe("2026-10-31T17:00:00.000Z");

    expect(() =>
      parseIsoDateTimeWithTimezone("2026-11-01", "startDate"),
    ).toThrow(ValidationError);

    expect(() =>
      parseIsoDateTimeWithTimezone("2026-11-01T00:00:00", "startDate"),
    ).toThrow(ValidationError);

    expect(() =>
      parseIsoDateTimeWithTimezone("2026-02-30T10:00:00Z", "endDate"),
    ).toThrow(ValidationError);

    expect(() =>
      parseIsoDateTimeWithTimezone("   ", "startDate"),
    ).toThrow(ValidationError);
  });
});
