import { BusinessRuleError, ValidationError } from "./errors";
import { COUNT_ONLY_UNITS } from "../db/schema";

const DECIMAL_FORMAT_PATTERN = /^-?\d+(?:\.\d+)?$/;
const COUNT_ONLY_UNIT_SET = new Set<string>(COUNT_ONLY_UNITS);

export const PRICE_SCALE = 2 as const;
export const PRICE_MAX_INTEGER_DIGITS = 12;

export const STOCK_SCALE = 3 as const;
export const STOCK_MAX_INTEGER_DIGITS = 11;

export interface ParsedDecimal {
  scaled: bigint;
  isNegative: boolean;
  isZero: boolean;
  hasFractionalPart: boolean;
  canonical: string;
}

/**
 * Formats a scaled BigInt back into a fixed-decimal string without floating-point arithmetic.
 */
export function formatScaledDecimal(scaled: bigint, scale: 2 | 3): string {
  const negative = scaled < 0n;
  const absValue = negative ? -scaled : scaled;
  const factor = scale === 2 ? 100n : 1000n;
  const integerPart = absValue / factor;
  const fractionalPart = (absValue % factor).toString().padStart(scale, "0");

  return `${negative ? "-" : ""}${integerPart.toString()}.${fractionalPart}`;
}

/**
 * Parses and validates a decimal string into exact scaled BigInt representation.
 */
export function parseDecimalString(
  raw: string,
  scale: 2 | 3,
  maxIntegerDigits: number,
  fieldName: string,
): ParsedDecimal {
  if (!DECIMAL_FORMAT_PATTERN.test(raw)) {
    throw new ValidationError("Validasi angka tidak valid", [
      {
        field: fieldName,
        message: `${fieldName} harus berupa string angka desimal yang valid`,
      },
    ]);
  }

  const isNegative = raw.startsWith("-");
  const unsigned = isNegative ? raw.slice(1) : raw;
  const [rawIntPart, rawFracPart = ""] = unsigned.split(".");

  if (rawFracPart.length > scale) {
    throw new ValidationError("Presisi desimal melebihi batas", [
      {
        field: fieldName,
        message: `${fieldName} maksimal memiliki ${scale} angka di belakang koma`,
      },
    ]);
  }

  const normalizedInt = rawIntPart!.replace(/^0+/, "") || "0";
  if (normalizedInt.length > maxIntegerDigits) {
    throw new ValidationError("Nilai melebihi batas kapasitas penyimpanan", [
      {
        field: fieldName,
        message: `${fieldName} melebihi batas maksimum digit yang didukung`,
      },
    ]);
  }

  const paddedFrac = rawFracPart.padEnd(scale, "0");
  const absScaled = BigInt(`${normalizedInt}${paddedFrac}`);
  const scaled = isNegative && absScaled !== 0n ? -absScaled : absScaled;
  const factor = scale === 2 ? 100n : 1000n;

  return {
    scaled,
    isNegative: scaled < 0n,
    isZero: scaled === 0n,
    hasFractionalPart: absScaled % factor !== 0n,
    canonical: formatScaledDecimal(scaled, scale),
  };
}

/**
 * Checks whether a normalized lowercase unit permits only integer quantities.
 */
export function isCountOnlyUnit(normalizedUnit: string): boolean {
  return COUNT_ONLY_UNIT_SET.has(normalizedUnit);
}

/**
 * Validates and normalizes a nonnegative price string (`NUMERIC(14,2)`).
 */
export function parseNonNegativePrice(
  raw: string,
  fieldName: string,
): string {
  const parsed = parseDecimalString(
    raw,
    PRICE_SCALE,
    PRICE_MAX_INTEGER_DIGITS,
    fieldName,
  );

  if (parsed.isNegative) {
    throw new BusinessRuleError(
      `${fieldName} tidak boleh bernilai negatif`,
      "BUSINESS_RULE_VIOLATION",
      [{ field: fieldName, message: `${fieldName} harus bernilai >= 0` }],
    );
  }

  return parsed.canonical;
}

/**
 * Ensures a scaled quantity/stock value matches unit decimal precision rules.
 */
export function assertUnitPrecision(
  parsed: ParsedDecimal,
  normalizedUnit: string,
  fieldName: string,
): void {
  if (isCountOnlyUnit(normalizedUnit) && parsed.hasFractionalPart) {
    throw new BusinessRuleError(
      `Satuan '${normalizedUnit}' hanya mendukung nilai bilangan bulat`,
      "INVALID_UNIT_QUANTITY",
      [
        {
          field: fieldName,
          message: `Satuan '${normalizedUnit}' tidak memperbolehkan nilai pecahan`,
        },
      ],
    );
  }
}

/**
 * Validates and normalizes `minimumStock` (`NUMERIC(14,3)`) against product unit rules.
 */
export function parseMinimumStock(
  raw: string,
  normalizedUnit: string,
  fieldName = "minimumStock",
): string {
  const parsed = parseDecimalString(
    raw,
    STOCK_SCALE,
    STOCK_MAX_INTEGER_DIGITS,
    fieldName,
  );

  if (parsed.isNegative) {
    throw new BusinessRuleError(
      "Minimum stock tidak boleh bernilai negatif",
      "BUSINESS_RULE_VIOLATION",
      [{ field: fieldName, message: "minimumStock harus bernilai >= 0" }],
    );
  }

  assertUnitPrecision(parsed, normalizedUnit, fieldName);
  return parsed.canonical;
}

/**
 * Validates an existing stored `minimumStock` value against a target normalized unit.
 */
export function validateStoredMinimumStockForUnit(
  storedMinimumStock: string,
  normalizedUnit: string,
): void {
  const parsed = parseDecimalString(
    storedMinimumStock,
    STOCK_SCALE,
    STOCK_MAX_INTEGER_DIGITS,
    "minimumStock",
  );
  assertUnitPrecision(parsed, normalizedUnit, "minimumStock");
}
