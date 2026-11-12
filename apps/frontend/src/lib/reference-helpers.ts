import type { BadgeTone } from "@/components/ui/badge";
import { isCountOnlyUnit, validateDecimalInput } from "@/lib/format";
import type {
  CategoryDto,
  ProductDto,
  ProductStatus,
  StockMovementDto,
  UserDto,
} from "@/types/inventory";

export const REFERENCE_PAGE_SIZE = 20;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReferenceSelectOption<T = unknown> {
  id: string;
  label: string;
  description?: string;
  badgeLabel?: string;
  badgeTone?: BadgeTone;
  data: T;
}

export type StockProductRef = Pick<
  ProductDto,
  "id" | "sku" | "name" | "unit" | "status"
> & {
  currentStock?: string;
};

export interface StockMovementDeepLinkState {
  initialProductId: string;
  initialType: "in" | "out";
  shouldAutoOpenCreate: boolean;
  invalidProductIdError: string | null;
}

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/**
 * Parses `/stock-movements` query parameters cleanly without discarding valid deep-linked product filters.
 */
export function parseStockMovementDeepLink(params: {
  productId: string | null;
  type: string | null;
  view: string | null;
}): StockMovementDeepLinkState {
  const initialType: "in" | "out" = params.type === "out" ? "out" : "in";
  const rawProductId = params.productId?.trim() ?? "";

  if (!rawProductId) {
    return {
      initialProductId: "",
      initialType,
      shouldAutoOpenCreate: false,
      invalidProductIdError: null,
    };
  }

  if (!isValidUuid(rawProductId)) {
    return {
      initialProductId: "",
      initialType,
      shouldAutoOpenCreate: false,
      invalidProductIdError:
        "Parameter URL productId tidak valid (harus berupa UUID). Menampilkan seluruh riwayat pergerakan stok.",
    };
  }

  return {
    initialProductId: rawProductId,
    initialType,
    shouldAutoOpenCreate: params.view !== "history",
    invalidProductIdError: null,
  };
}

export function toCategoryOption(
  category: Pick<CategoryDto, "id" | "name" | "isActive">,
): ReferenceSelectOption<Pick<CategoryDto, "id" | "name" | "isActive">> {
  return {
    id: category.id,
    label: category.name,
    badgeLabel: category.isActive ? undefined : "Nonaktif",
    badgeTone: category.isActive ? undefined : "slate",
    data: category,
  };
}

export function toProductOption(
  product: StockProductRef,
  stockLabel?: string,
): ReferenceSelectOption<StockProductRef> {
  return {
    id: product.id,
    label: `${product.sku} — ${product.name}`,
    description: stockLabel,
    badgeLabel: product.status === "inactive" ? "Nonaktif" : undefined,
    badgeTone: product.status === "inactive" ? "slate" : undefined,
    data: product,
  };
}

export function toUserOption(
  user: Pick<UserDto, "id" | "name" | "email" | "role" | "isActive">,
): ReferenceSelectOption<Pick<UserDto, "id" | "name" | "email" | "role" | "isActive">> {
  return {
    id: user.id,
    label: `${user.name} (${user.role})`,
    description: user.email,
    badgeLabel: user.isActive ? undefined : "Nonaktif",
    badgeTone: user.isActive ? undefined : "slate",
    data: user,
  };
}

export function mergeUniqueOptions<T>(
  base: readonly ReferenceSelectOption<T>[],
  incoming: readonly ReferenceSelectOption<T>[],
): ReferenceSelectOption<T>[] {
  const seen = new Set<string>();
  const merged: ReferenceSelectOption<T>[] = [];

  for (const option of base) {
    if (!seen.has(option.id)) {
      seen.add(option.id);
      merged.push(option);
    }
  }

  for (const option of incoming) {
    if (!seen.has(option.id)) {
      seen.add(option.id);
      merged.push(option);
    }
  }

  return merged;
}

export function filterLocalOptions<T>(
  options: readonly ReferenceSelectOption<T>[],
  search: string,
): ReferenceSelectOption<T>[] {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return [...options];
  }

  return options.filter((opt) => {
    const labelMatch = opt.label.toLowerCase().includes(normalized);
    const descMatch = opt.description
      ? opt.description.toLowerCase().includes(normalized)
      : false;
    return labelMatch || descMatch;
  });
}

/**
 * Extracts unique inactive product references observed in loaded stock movement history rows
 * so Staff can filter history by inactive products visible in movements without querying restricted product endpoints.
 */
export function extractObservedInactiveProducts(
  movements: readonly StockMovementDto[],
): StockProductRef[] {
  const byId = new Map<string, StockProductRef>();
  for (const mov of movements) {
    if (mov.product.status === "inactive" && !byId.has(mov.product.id)) {
      byId.set(mov.product.id, {
        id: mov.product.id,
        sku: mov.product.sku,
        name: mov.product.name,
        unit: mov.product.unit,
        status: mov.product.status,
      });
    }
  }
  return [...byId.values()];
}

export function isProductActiveStatus(status: ProductStatus | undefined): boolean {
  return status === "active";
}

/**
 * Validates stock movement form submission rules, blocking inactive products and fractional quantities on count-only units.
 */
export function validateStockMovementSubmission(input: {
  productId: string;
  selectedProduct: StockProductRef | null;
  quantity: string;
  reason: string;
}): string | null {
  if (!input.productId || !input.selectedProduct) {
    return "Produk aktif wajib dipilih.";
  }

  if (!isProductActiveStatus(input.selectedProduct.status)) {
    return "Produk nonaktif tidak dapat digunakan untuk transaksi Stock In / Stock Out.";
  }

  const qtyErr = validateDecimalInput(input.quantity, {
    fieldLabel: "Jumlah",
    scale: 3,
    positiveOnly: true,
    countOnlyUnit: isCountOnlyUnit(input.selectedProduct.unit),
  });
  if (qtyErr) {
    return qtyErr;
  }

  if (!input.reason.trim()) {
    return "Alasan transaksi wajib diisi.";
  }

  return null;
}
