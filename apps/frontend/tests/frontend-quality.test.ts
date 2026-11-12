import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SearchableSelect,
  SearchableSelectDropdownList,
} from "@/components/ui/searchable-select";
import { ProductDetailModalContent } from "@/features/products/product-detail-modal-content";
import { StockMovementTableRow } from "@/features/stock-movements/stock-movement-row";
import {
  ApiClientError,
  apiRequest,
  setUnauthorizedHandler,
} from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/errors";
import {
  formatCurrencyIdr,
  formatDateTimeWib,
  formatStockQuantity,
} from "@/lib/format";
import {
  extractObservedInactiveProducts,
  filterLocalOptions,
  isProductActiveStatus,
  mergeUniqueOptions,
  parseStockMovementDeepLink,
  REFERENCE_PAGE_SIZE,
  toCategoryOption,
  toProductOption,
  validateStockMovementSubmission,
} from "@/lib/reference-helpers";
import { productsService } from "@/services/products.service";
import {
  isAdminProductDto,
  type ProductAdminDto,
  type ProductStaffDto,
  type StockMovementDto,
} from "@/types/inventory";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setUnauthorizedHandler(null);
});

describe("Frontend F-05 quality & helpers", () => {
  test("reference pagination merges items beyond page 1 without losing uniqueness", () => {
    expect(REFERENCE_PAGE_SIZE).toBe(20);

    const page1 = Array.from({ length: 20 }, (_, i) =>
      toCategoryOption({
        id: `cat-${i + 1}`,
        name: `Kategori ${i + 1}`,
        isActive: true,
      }),
    );
    const page2 = [
      toCategoryOption({ id: "cat-20", name: "Kategori 20", isActive: true }),
      toCategoryOption({ id: "cat-105", name: "Kategori 105", isActive: true }),
    ];

    const merged = mergeUniqueOptions(page1, page2);
    expect(merged).toHaveLength(21);
    expect(merged.some((item) => item.id === "cat-105")).toBe(true);
  });

  test("deep-link parser preserves valid UUID productId filter and handles invalid UUID safely", () => {
    const validUuid = "11111111-2222-3333-4444-555555555555";
    const activeCreate = parseStockMovementDeepLink({
      productId: ` ${validUuid} `,
      type: "out",
      view: null,
    });
    expect(activeCreate).toEqual({
      initialProductId: validUuid,
      initialType: "out",
      shouldAutoOpenCreate: true,
      invalidProductIdError: null,
    });

    const historyOnly = parseStockMovementDeepLink({
      productId: validUuid,
      type: null,
      view: "history",
    });
    expect(historyOnly.initialProductId).toBe(validUuid);
    expect(historyOnly.shouldAutoOpenCreate).toBe(false);

    const malformed = parseStockMovementDeepLink({
      productId: "not-a-uuid",
      type: "in",
      view: null,
    });
    expect(malformed.initialProductId).toBe("");
    expect(malformed.shouldAutoOpenCreate).toBe(false);
    expect(malformed.invalidProductIdError).toContain("tidak valid");
  });

  test("extracts observed inactive products for Staff history filter while blocking Stock In/Out on inactive products", () => {
    const sampleMovements: StockMovementDto[] = [
      {
        id: "mov-1",
        product: {
          id: "prod-inactive-1",
          sku: "OLD-001",
          name: "Kabel VGA Lama",
          unit: "pcs",
          status: "inactive",
        },
        type: "out",
        quantity: "2.000",
        stockBefore: "5.000",
        stockAfter: "3.000",
        reason: "Retur",
        notes: null,
        createdBy: { id: "user-1", name: "Staff" },
        createdAt: "2026-11-12T08:00:00.000Z",
      },
      {
        id: "mov-2",
        product: {
          id: "prod-active-1",
          sku: "NEW-001",
          name: "Kabel HDMI",
          unit: "pcs",
          status: "active",
        },
        type: "in",
        quantity: "10.000",
        stockBefore: "0.000",
        stockAfter: "10.000",
        reason: "Restock",
        notes: null,
        createdBy: { id: "user-1", name: "Staff" },
        createdAt: "2026-11-12T09:00:00.000Z",
      },
    ];

    const observedInactive = extractObservedInactiveProducts(sampleMovements);
    expect(observedInactive).toHaveLength(1);
    expect(observedInactive[0]?.id).toBe("prod-inactive-1");
    expect(isProductActiveStatus(observedInactive[0]?.status)).toBe(false);
    expect(isProductActiveStatus("active")).toBe(true);

    const inactiveOpt = toProductOption(observedInactive[0]!);
    expect(inactiveOpt.badgeLabel).toBe("Nonaktif");
    expect(filterLocalOptions([inactiveOpt], "vga")).toHaveLength(1);
    expect(filterLocalOptions([inactiveOpt], "hdmi")).toHaveLength(0);
  });

  test("productsService.getProductById preserves role-scoped Admin vs Staff DTOs and full description", async () => {
    const adminDto: ProductAdminDto = {
      id: "prod-1",
      category: { id: "cat-1", name: "Elektronik" },
      sku: "ELK-001",
      name: "Monitor 27 Inch",
      description: "Monitor IPS 27 inch resolusi 2K dengan dukungan warna sRGB 100%.",
      unit: "unit",
      purchasePrice: "2500000.00",
      sellingPrice: "3200000.00",
      currentStock: "8.000",
      minimumStock: "2.000",
      status: "active",
      createdAt: "2026-11-12T01:00:00.000Z",
      updatedAt: "2026-11-12T02:00:00.000Z",
    };

    const staffDto: ProductStaffDto = {
      id: "prod-1",
      category: { id: "cat-1", name: "Elektronik" },
      sku: "ELK-001",
      name: "Monitor 27 Inch",
      description: adminDto.description,
      unit: "unit",
      currentStock: "8.000",
      minimumStock: "2.000",
      status: "active",
      createdAt: "2026-11-12T01:00:00.000Z",
      updatedAt: "2026-11-12T02:00:00.000Z",
    };

    expect(isAdminProductDto(adminDto)).toBe(true);
    expect(isAdminProductDto(staffDto)).toBe(false);
    expect(formatCurrencyIdr(adminDto.sellingPrice)).toBe("Rp 3.200.000");
    expect(formatDateTimeWib(adminDto.createdAt)).toContain("2026");

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: staffDto }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const fetched = await productsService.getProductById("prod-1");
    expect(fetched.description).toBe(adminDto.description);
    expect("purchasePrice" in fetched).toBe(false);
    expect("sellingPrice" in fetched).toBe(false);
  });

  test("stockBefore and stockAfter format consistently with product unit and reference errors surface cleanly", () => {
    expect(formatStockQuantity("12.000", "pcs")).toBe("12 pcs");
    expect(formatStockQuantity("15.500", "kg")).toBe("15,5 kg");

    const apiErr = new ApiClientError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Gagal memuat daftar kategori.",
      details: [],
    });
    expect(extractErrorMessage(apiErr, "Fallback")).toBe(
      "Gagal memuat daftar kategori.",
    );
  });
});

describe("Frontend UI component rendering & behavior", () => {
  test("SearchableSelect renders closed trigger states including placeholder, selected badge, and fallback UUID label", () => {
    const emptyHtml = renderToStaticMarkup(
      createElement(SearchableSelect, {
        id: "cat-select",
        value: "",
        onChange: () => {},
        fetchPage: async () => ({
          options: [],
          meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
        placeholder: "Pilih kategori",
      }),
    );
    expect(emptyHtml).toContain("Pilih kategori");
    expect(emptyHtml).toContain('aria-haspopup="listbox"');

    const selectedHtml = renderToStaticMarkup(
      createElement(SearchableSelect, {
        id: "prod-select",
        value: "prod-99",
        selectedOption: {
          id: "prod-99",
          label: "OLD-99 — Kabel Serial",
          badgeLabel: "Nonaktif",
          badgeTone: "slate",
          data: { id: "prod-99" },
        },
        onChange: () => {},
        fetchPage: async () => ({
          options: [],
          meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
        placeholder: "Pilih produk",
      }),
    );
    expect(selectedHtml).toContain("OLD-99 — Kabel Serial");
    expect(selectedHtml).toContain("Nonaktif");

    const fallbackHtml = renderToStaticMarkup(
      createElement(SearchableSelect, {
        id: "prod-fallback",
        value: "12345678-aaaa-bbbb-cccc-111122223333",
        onChange: () => {},
        fetchPage: async () => ({
          options: [],
          meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
        placeholder: "Pilih produk",
      }),
    );
    expect(fallbackHtml).toContain("Terpilih (12345678...)");
  });

  test("SearchableSelectDropdownList renders loading, error+retry, empty, and paginated option states", () => {
    const baseProps = {
      id: "dropdown-test",
      value: "opt-1",
      searchInput: "",
      searchPlaceholder: "Cari...",
      allowClear: true,
      clearLabel: "Semua Produk",
      emptyMessage: "Tidak ada data yang cocok.",
      isLoading: false,
      isLoadingMore: false,
      loadError: null,
      visibleOptions: [],
      loadedCount: 0,
      meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      onSearchChange: () => {},
      onSelect: () => {},
      onRetry: () => {},
      onLoadMore: () => {},
    };

    const loadingHtml = renderToStaticMarkup(
      createElement(SearchableSelectDropdownList, {
        ...baseProps,
        isLoading: true,
      }),
    );
    expect(loadingHtml).toContain("Memuat daftar pilihan...");

    const errorHtml = renderToStaticMarkup(
      createElement(SearchableSelectDropdownList, {
        ...baseProps,
        loadError: "Koneksi gagal.",
      }),
    );
    expect(errorHtml).toContain("Koneksi gagal.");
    expect(errorHtml).toContain("Coba Lagi");

    const emptyHtml = renderToStaticMarkup(
      createElement(SearchableSelectDropdownList, baseProps),
    );
    expect(emptyHtml).toContain("Tidak ada data yang cocok.");

    const pagedHtml = renderToStaticMarkup(
      createElement(SearchableSelectDropdownList, {
        ...baseProps,
        loadedCount: 20,
        meta: { page: 1, pageSize: 20, totalItems: 45, totalPages: 3 },
        visibleOptions: [
          {
            id: "opt-1",
            label: "SKU-001 — Keyboard",
            description: "Stok: 10 unit",
            data: {},
          },
          {
            id: "opt-2",
            label: "SKU-002 — Mouse",
            badgeLabel: "Nonaktif",
            badgeTone: "slate",
            data: {},
          },
        ],
      }),
    );
    expect(pagedHtml).toContain("Semua Produk");
    expect(pagedHtml).toContain("SKU-001 — Keyboard");
    expect(pagedHtml).toContain("Stok: 10 unit");
    expect(pagedHtml).toContain('aria-selected="true"');
    expect(pagedHtml).toContain("Nonaktif");
    expect(pagedHtml).toContain("Muat lebih banyak (20 dari 45)");

    const loadingMoreHtml = renderToStaticMarkup(
      createElement(SearchableSelectDropdownList, {
        ...baseProps,
        loadedCount: 20,
        isLoadingMore: true,
        meta: { page: 1, pageSize: 20, totalItems: 45, totalPages: 3 },
        visibleOptions: [
          { id: "opt-1", label: "SKU-001 — Keyboard", data: {} },
        ],
      }),
    );
    expect(loadingMoreHtml).toContain("Memuat halaman berikutnya...");
  });

  test("ProductDetailModalContent enforces Admin vs Staff price visibility, loading/error states, and active links", () => {
    const adminProduct: ProductAdminDto = {
      id: "prod-admin-1",
      category: { id: "cat-1", name: "Elektronik" },
      sku: "ELK-100",
      name: "Monitor Ultrawide",
      description: "Deskripsi lengkap:\nPanel IPS 34 inci dengan USB-C PD.",
      unit: "unit",
      purchasePrice: "4500000.00",
      sellingPrice: "5900000.00",
      currentStock: "2.000",
      minimumStock: "3.000",
      status: "active",
      createdAt: "2026-11-12T01:00:00.000Z",
      updatedAt: "2026-11-12T02:00:00.000Z",
    };

    const staffProduct: ProductStaffDto = {
      id: "prod-staff-1",
      category: { id: "cat-1", name: "Elektronik" },
      sku: "ELK-200",
      name: "Kabel DisplayPort",
      description: "Kabel DP 1.4 2 meter.",
      unit: "pcs",
      currentStock: "5.000",
      minimumStock: "2.000",
      status: "inactive",
      createdAt: "2026-11-12T01:00:00.000Z",
      updatedAt: "2026-11-12T02:00:00.000Z",
    };

    const loadingHtml = renderToStaticMarkup(
      createElement(ProductDetailModalContent, {
        isAdmin: true,
        loading: true,
        error: null,
        product: null,
        onRetry: () => {},
      }),
    );
    expect(loadingHtml).toContain("Memuat detail produk...");

    const errorHtml = renderToStaticMarkup(
      createElement(ProductDetailModalContent, {
        isAdmin: false,
        loading: false,
        error: "Detail produk gagal dimuat.",
        product: null,
        onRetry: () => {},
      }),
    );
    expect(errorHtml).toContain("Detail produk gagal dimuat.");
    expect(errorHtml).toContain("Coba Lagi");

    const adminHtml = renderToStaticMarkup(
      createElement(ProductDetailModalContent, {
        isAdmin: true,
        loading: false,
        error: null,
        product: adminProduct,
        onRetry: () => {},
      }),
    );
    expect(adminHtml).toContain("ELK-100");
    expect(adminHtml).toContain("Monitor Ultrawide");
    expect(adminHtml).toContain("Harga Beli");
    expect(adminHtml).toContain("Harga Jual");
    expect(adminHtml).toContain("4.500.000");
    expect(adminHtml).toContain("5.900.000");
    expect(adminHtml).toContain("Menipis");
    expect(adminHtml).toContain("Panel IPS 34 inci dengan USB-C PD.");
    expect(adminHtml).toContain("Catat Stok");
    expect(adminHtml).toContain("Lihat Riwayat Stok");

    const staffInactiveHtml = renderToStaticMarkup(
      createElement(ProductDetailModalContent, {
        isAdmin: false,
        loading: false,
        error: null,
        product: staffProduct,
        onRetry: () => {},
      }),
    );
    expect(staffInactiveHtml).toContain("ELK-200");
    expect(staffInactiveHtml).toContain("Kabel DP 1.4 2 meter.");
    expect(staffInactiveHtml.includes("Harga Beli")).toBe(false);
    expect(staffInactiveHtml.includes("Harga Jual")).toBe(false);
    expect(staffInactiveHtml.includes("Rp")).toBe(false);
    expect(staffInactiveHtml).toContain("Lihat Riwayat Stok");
    expect(staffInactiveHtml.includes("Catat Stok")).toBe(false);
  });

  test("StockMovement validation blocks inactive products & bad precision, and StockMovementTableRow formats units consistently", () => {
    expect(
      validateStockMovementSubmission({
        productId: "",
        selectedProduct: null,
        quantity: "5",
        reason: "Restock",
      }),
    ).toBe("Produk aktif wajib dipilih.");

    expect(
      validateStockMovementSubmission({
        productId: "p-inact",
        selectedProduct: {
          id: "p-inact",
          sku: "OLD-1",
          name: "Legacy Item",
          unit: "pcs",
          status: "inactive",
        },
        quantity: "2",
        reason: "Restock",
      }),
    ).toContain("Produk nonaktif");

    expect(
      validateStockMovementSubmission({
        productId: "p-pcs",
        selectedProduct: {
          id: "p-pcs",
          sku: "PCS-1",
          name: "Box Item",
          unit: "pcs",
          status: "active",
        },
        quantity: "1.5",
        reason: "Restock",
      }),
    ).toContain("bilangan bulat");

    expect(
      validateStockMovementSubmission({
        productId: "p-kg",
        selectedProduct: {
          id: "p-kg",
          sku: "KG-1",
          name: "Biji Kopi",
          unit: "kg",
          status: "active",
        },
        quantity: "2.375",
        reason: "  ",
      }),
    ).toBe("Alasan transaksi wajib diisi.");

    expect(
      validateStockMovementSubmission({
        productId: "p-kg",
        selectedProduct: {
          id: "p-kg",
          sku: "KG-1",
          name: "Biji Kopi",
          unit: "kg",
          status: "active",
        },
        quantity: "2.375",
        reason: "Pembelian",
      }),
    ).toBe(null);

    const inactiveMovement: StockMovementDto = {
      id: "mov-99",
      product: {
        id: "prod-99",
        sku: "KOPI-01",
        name: "Kopi Arabika",
        unit: "kg",
        status: "inactive",
      },
      type: "in",
      quantity: "2.500",
      stockBefore: "1.250",
      stockAfter: "3.750",
      reason: "Pembelian batch",
      notes: null,
      createdBy: { id: "user-1", name: "Admin Gudang" },
      createdAt: "2026-11-12T04:30:00.000Z",
    };

    const rowHtml = renderToStaticMarkup(
      createElement(
        "table",
        null,
        createElement(
          "tbody",
          null,
          createElement(StockMovementTableRow, {
            movement: inactiveMovement,
            onInspect: () => {},
          }),
        ),
      ),
    );
    expect(rowHtml).toContain("Kopi Arabika");
    expect(rowHtml).toContain("Nonaktif");
    expect(rowHtml).toContain("Stock In");
    expect(rowHtml).toContain("2,5 kg");
    expect(rowHtml).toContain("1,25 kg");
    expect(rowHtml).toContain("3,75 kg");
    expect(rowHtml).toContain("Oleh: Admin Gudang");
  });

  test("apiRequest propagates API/network/rate-limit/401/abort errors cleanly for UI retry handling", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = "";
    let attempt = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      attempt += 1;
      capturedUrl = String(input);
      capturedInit = init;
      if (attempt === 1) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "X-Request-ID": "srv-req-123",
        },
      });
    }) as unknown as typeof fetch;

    // First attempt fails with NETWORK_ERROR (status 0), second succeeds on caller retry
    let firstErr: unknown = null;
    try {
      await apiRequest("/products", { query: { page: 2, empty: "" } });
    } catch (err) {
      firstErr = err;
    }
    expect(firstErr instanceof ApiClientError).toBe(true);
    expect((firstErr as ApiClientError).status).toBe(0);
    expect((firstErr as ApiClientError).code).toBe("NETWORK_ERROR");
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.cache).toBe("no-store");
    expect(capturedUrl).toContain("/products?page=2");
    expect(capturedUrl.includes("empty=")).toBe(false);

    const retryRes = await apiRequest<{ success: boolean; data: { ok: boolean } }>(
      "/products",
      { query: { page: 2 } },
    );
    expect(retryRes.data.ok).toBe(true);

    // 400 validation error includes formatted field details
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Data tidak valid.",
            details: [{ field: "sku", message: "SKU wajib diisi." }],
            requestId: "req-400",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      await apiRequest("/products", { method: "POST", body: {} });
      throw new Error("Expected ApiClientError");
    } catch (err) {
      expect(err instanceof ApiClientError).toBe(true);
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.requestId).toBe("req-400");
      expect(extractErrorMessage(apiErr)).toBe(
        "Data tidak valid. SKU wajib diisi.",
      );
    }

    // 429 rate limit exposes Retry-After header; 401 invokes unauthorizedHandler unless skipped
    let unauthorizedCalls = 0;
    setUnauthorizedHandler(() => {
      unauthorizedCalls += 1;
    });

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "UNAUTHENTICATED", message: "Sesi berakhir." },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    let unauthErr1: unknown = null;
    try {
      await apiRequest("/auth/me");
    } catch (err) {
      unauthErr1 = err;
    }
    expect(unauthErr1 instanceof ApiClientError).toBe(true);
    expect(unauthorizedCalls).toBe(1);

    let unauthErr2: unknown = null;
    try {
      await apiRequest("/auth/me", { skipUnauthorizedHandler: true });
    } catch (err) {
      unauthErr2 = err;
    }
    expect(unauthErr2 instanceof ApiClientError).toBe(true);
    expect(unauthorizedCalls).toBe(1);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "RATE_LIMIT_EXCEEDED", message: "Terlalu banyak." },
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "Retry-After": "12.2",
          },
        },
      )) as unknown as typeof fetch;

    try {
      await apiRequest("/auth/login", { method: "POST", body: {} });
    } catch (err) {
      expect((err as ApiClientError).retryAfterSeconds).toBe(13);
    }

    // AbortError must pass through raw so components know request was cancelled intentionally
    globalThis.fetch = (async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;

    let abortedErr: unknown = null;
    try {
      await apiRequest("/categories");
    } catch (err) {
      abortedErr = err;
    }
    expect(abortedErr instanceof DOMException).toBe(true);
    expect((abortedErr as DOMException).name).toBe("AbortError");
  });
});
