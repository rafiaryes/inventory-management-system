import { describe, expect, test } from "bun:test";
import {
  formatScaledDecimal,
  isCountOnlyUnit,
  parseDecimalString,
  parseMinimumStock,
  parseNonNegativePrice,
} from "../src/common/decimal";
import { BusinessRuleError, ValidationError } from "../src/common/errors";
import {
  buildPaginationMeta,
  escapeLikePattern,
  parseBaseListQuery,
  parseBooleanParam,
} from "../src/common/pagination";

describe("decimal and pagination helpers", () => {
  test("parses and formats exact scaled BigInt decimals", () => {
    const parsedPrice = parseDecimalString("150000.5", 2, 12, "purchasePrice");
    expect(parsedPrice.scaled).toBe(15000050n);
    expect(parsedPrice.canonical).toBe("150000.50");
    expect(parsedPrice.isNegative).toBe(false);
    expect(parsedPrice.hasFractionalPart).toBe(true);

    const parsedMaxStock = parseDecimalString(
      "99999999999.999",
      3,
      11,
      "minimumStock",
    );
    expect(parsedMaxStock.canonical).toBe("99999999999.999");
    expect(formatScaledDecimal(-1050n, 3)).toBe("-1.050");
  });

  test("rejects malformed or over-precision decimals with 400 VALIDATION_ERROR", () => {
    expect(() => parseDecimalString("12.345", 2, 12, "purchasePrice")).toThrow(
      ValidationError,
    );
    expect(() => parseDecimalString("1.2345", 3, 11, "minimumStock")).toThrow(
      ValidationError,
    );
    expect(() =>
      parseDecimalString("1000000000000.00", 2, 12, "purchasePrice"),
    ).toThrow(ValidationError);
    expect(() => parseDecimalString("1e5", 2, 12, "purchasePrice")).toThrow(
      ValidationError,
    );
    expect(() => parseDecimalString(" 10.00 ", 2, 12, "purchasePrice")).toThrow(
      ValidationError,
    );
  });

  test("enforces nonnegative rules and count-only unit integer rules with 422", () => {
    expect(parseNonNegativePrice("0", "purchasePrice")).toBe("0.00");
    expect(() => parseNonNegativePrice("-0.01", "purchasePrice")).toThrow(
      BusinessRuleError,
    );

    expect(isCountOnlyUnit("pcs")).toBe(true);
    expect(isCountOnlyUnit("kg")).toBe(false);

    expect(parseMinimumStock("5", "pcs")).toBe("5.000");
    expect(parseMinimumStock("5.000", "unit")).toBe("5.000");
    expect(parseMinimumStock("2.5", "kg")).toBe("2.500");

    try {
      parseMinimumStock("2.500", "pcs");
      expect.unreachable("Should throw INVALID_UNIT_QUANTITY");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).code).toBe("INVALID_UNIT_QUANTITY");
    }

    expect(() => parseMinimumStock("-1.000", "kg")).toThrow(BusinessRuleError);
  });

  test("validates pagination, boolean filters, sortOrder, and LIKE escaping", () => {
    expect(parseBaseListQuery({})).toEqual({
      page: 1,
      pageSize: 10,
      search: undefined,
      sortOrder: "desc",
    });

    expect(
      parseBaseListQuery({
        page: "2",
        pageSize: "100",
        search: "  Keyboard  ",
        sortOrder: "asc",
      }),
    ).toEqual({
      page: 2,
      pageSize: 100,
      search: "Keyboard",
      sortOrder: "asc",
    });

    expect(() => parseBaseListQuery({ page: "0" })).toThrow(ValidationError);
    expect(() => parseBaseListQuery({ page: "1.5" })).toThrow(ValidationError);
    expect(() => parseBaseListQuery({ pageSize: "101" })).toThrow(
      ValidationError,
    );
    expect(() => parseBaseListQuery({ sortOrder: "random" })).toThrow(
      ValidationError,
    );

    expect(parseBooleanParam("true", "isActive")).toBe(true);
    expect(parseBooleanParam("false", "isActive")).toBe(false);
    expect(() => parseBooleanParam("yes", "isActive")).toThrow(ValidationError);

    expect(buildPaginationMeta(1, 10, 0)).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    });
    expect(buildPaginationMeta(2, 10, 21)).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 21,
      totalPages: 3,
    });

    expect(escapeLikePattern("100%_test\\ok")).toBe("100\\%\\_test\\\\ok");
  });
});
