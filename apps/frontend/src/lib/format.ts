const COUNT_ONLY_UNITS = new Set(["pcs", "unit", "box", "pack", "set"]);

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function isCountOnlyUnit(unit: string): boolean {
  return COUNT_ONLY_UNITS.has(unit.trim().toLowerCase());
}

/**
 * Formats an ISO 8601 UTC timestamp in the business timezone (`Asia/Jakarta`).
 */
export function formatDateTimeWib(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Formats a `NUMERIC(14,2)` string as Indonesian Rupiah without floating-point rounding.
 */
export function formatCurrencyIdr(rawDecimal: string): string {
  const trimmed = rawDecimal.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [rawInt = "0", rawFrac = "00"] = unsigned.split(".");

  const groupedInt = rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = rawFrac.padEnd(2, "0").slice(0, 2);
  const prefix = negative ? "-Rp " : "Rp ";

  return frac === "00" ? `${prefix}${groupedInt}` : `${prefix}${groupedInt},${frac}`;
}

/**
 * Formats a `NUMERIC(14,3)` stock string cleanly (strips trailing decimal zeros when appropriate).
 */
export function formatStockQuantity(rawDecimal: string, unit?: string): string {
  const trimmed = rawDecimal.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [rawInt = "0", rawFrac = ""] = unsigned.split(".");

  const groupedInt = rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const strippedFrac = rawFrac.replace(/0+$/, "");
  const formattedNumber = strippedFrac
    ? `${negative ? "-" : ""}${groupedInt},${strippedFrac}`
    : `${negative ? "-" : ""}${groupedInt}`;

  return unit ? `${formattedNumber} ${unit}` : formattedNumber;
}

/**
 * Compares two nonnegative `NUMERIC(14,3)` strings (`a <= b`) via fixed-width zero padding.
 */
export function isDecimalLessThanOrEqual(a: string, b: string): boolean {
  return toFixedWidthNumeric(a, 3) <= toFixedWidthNumeric(b, 3);
}

function toFixedWidthNumeric(raw: string, scale: number): string {
  const [intPart = "0", fracPart = ""] = raw.trim().split(".");
  const normalizedInt = (intPart.replace(/^0+/, "") || "0").padStart(12, "0");
  const paddedFrac = fracPart.padEnd(scale, "0").slice(0, scale);
  return `${normalizedInt}${paddedFrac}`;
}

/**
 * Validates numeric input precision before submitting to the backend.
 */
export function validateDecimalInput(
  raw: string,
  options: {
    fieldLabel: string;
    scale: 2 | 3;
    positiveOnly?: boolean;
    countOnlyUnit?: boolean;
  },
): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !DECIMAL_PATTERN.test(trimmed)) {
    return `${options.fieldLabel} harus berupa angka desimal valid (gunakan titik '.' untuk desimal).`;
  }

  const [intPart = "0", fracPart = ""] = trimmed.split(".");
  const maxIntDigits = options.scale === 2 ? 12 : 11;
  const normalizedInt = intPart.replace(/^0+/, "") || "0";
  if (normalizedInt.length > maxIntDigits) {
    return `${options.fieldLabel} melebihi kapasitas digit maksimum.`;
  }

  if (fracPart.length > options.scale) {
    return `${options.fieldLabel} maksimal memiliki ${options.scale} angka di belakang koma.`;
  }

  const hasNonZero = /[1-9]/.test(normalizedInt) || /[1-9]/.test(fracPart);
  if (options.positiveOnly && !hasNonZero) {
    return `${options.fieldLabel} harus lebih besar dari 0.`;
  }

  if (options.countOnlyUnit && /[1-9]/.test(fracPart)) {
    return `${options.fieldLabel} harus berupa bilangan bulat untuk satuan hitungan.`;
  }

  return null;
}

/**
 * Converts `YYYY-MM-DD` local Jakarta calendar bounds into half-open ISO-8601 `+07:00` instants `[startDate, endDate)`.
 */
export function toJakartaDateRangeIso(
  startDateInput: string,
  endDateInput: string,
): { startDate?: string; endDate?: string; error?: string } {
  if (startDateInput && endDateInput && startDateInput > endDateInput) {
    return { error: "Tanggal awal tidak boleh lebih besar dari tanggal akhir." };
  }

  const startDate = startDateInput
    ? `${startDateInput}T00:00:00+07:00`
    : undefined;

  let endDate: string | undefined;
  if (endDateInput) {
    const [y, m, d] = endDateInput.split("-").map(Number);
    const nextDayUtc = new Date(Date.UTC(y!, m! - 1, d! + 1));
    const nextIsoDay = nextDayUtc.toISOString().slice(0, 10);
    endDate = `${nextIsoDay}T00:00:00+07:00`;
  }

  return { startDate, endDate };
}
