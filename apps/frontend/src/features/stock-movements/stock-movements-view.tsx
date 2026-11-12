"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackBanner } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { ModalDialog } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StockMovementTableRow } from "@/features/stock-movements/stock-movement-row";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/errors";
import {
  formatDateTimeWib,
  formatStockQuantity,
  isCountOnlyUnit,
  toJakartaDateRangeIso,
} from "@/lib/format";
import {
  extractObservedInactiveProducts,
  isProductActiveStatus,
  parseStockMovementDeepLink,
  toProductOption,
  toUserOption,
  validateStockMovementSubmission,
  type ReferenceSelectOption,
  type StockProductRef,
} from "@/lib/reference-helpers";
import { productsService } from "@/services/products.service";
import { stockMovementsService } from "@/services/stock-movements.service";
import { usersService } from "@/services/users.service";
import type { PaginationMeta } from "@/types/api";
import type {
  SortOrder,
  StockMovementDto,
  StockMovementType,
  UserDto,
} from "@/types/inventory";

const DEFAULT_META: PaginationMeta = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 0,
};

export function StockMovementsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const searchParams = useSearchParams();

  const productIdParam = searchParams.get("productId");
  const typeParam = searchParams.get("type");
  const viewParam = searchParams.get("view");

  const deepLink = useMemo(
    () =>
      parseStockMovementDeepLink({
        productId: productIdParam,
        type: typeParam,
        view: viewParam,
      }),
    [productIdParam, typeParam, viewParam],
  );

  const [items, setItems] = useState<StockMovementDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [observedInactiveById, setObservedInactiveById] = useState<
    Record<string, StockProductRef>
  >({});
  const [selectedFilterProduct, setSelectedFilterProduct] =
    useState<ReferenceSelectOption<StockProductRef> | null>(null);
  const [selectedCreatorOption, setSelectedCreatorOption] =
    useState<ReferenceSelectOption<
      Pick<UserDto, "id" | "name" | "email" | "role" | "isActive">
    > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(
    () => deepLink.invalidProductIdError,
  );
  const [deepLinkCanRetry, setDeepLinkCanRetry] = useState(false);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [deepLinkRetryKey, setDeepLinkRetryKey] = useState(0);
  const [staffRestrictedProductId, setStaffRestrictedProductId] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters (preserves initial deep-linked productId without removing URL query params)
  const [productIdFilter, setProductIdFilter] = useState(
    () => deepLink.initialProductId,
  );
  const [typeFilter, setTypeFilter] = useState<"" | StockMovementType>("");
  const [createdByFilter, setCreatedByFilter] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [appliedRange, setAppliedRange] = useState<{
    startDate?: string;
    endDate?: string;
  }>({});
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Transaction Modal (active products only)
  const [createOpen, setCreateOpen] = useState(false);
  const [formProductId, setFormProductId] = useState("");
  const [selectedFormProduct, setSelectedFormProduct] =
    useState<StockProductRef | null>(null);
  const [formType, setFormType] = useState<StockMovementType>(
    () => deepLink.initialType,
  );
  const [formQuantity, setFormQuantity] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail Modal
  const [detailMovement, setDetailMovement] = useState<StockMovementDto | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  // Sync deep-link filter when URL query changes and resolve target product via GET /products/:id
  useEffect(() => {
    const controller = new AbortController();

    async function resolveDeepLinkedProduct() {
      await Promise.resolve();
      if (controller.signal.aborted) {
        return;
      }

      setFormType(deepLink.initialType);
      setStaffRestrictedProductId(null);

      if (deepLink.invalidProductIdError) {
        setProductIdFilter("");
        setSelectedFilterProduct(null);
        setDeepLinkNotice(null);
        setDeepLinkCanRetry(false);
        setDeepLinkError(deepLink.invalidProductIdError);
        return;
      }

      if (!deepLink.initialProductId) {
        setDeepLinkError(null);
        setDeepLinkCanRetry(false);
        setDeepLinkNotice(null);
        return;
      }

      setProductIdFilter(deepLink.initialProductId);
      setPage(1);
      setDeepLinkError(null);
      setDeepLinkCanRetry(false);
      setDeepLinkNotice(null);

      try {
        const resolved = await productsService.getProductById(
          deepLink.initialProductId,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }

        const ref: StockProductRef = {
          id: resolved.id,
          sku: resolved.sku,
          name: resolved.name,
          unit: resolved.unit,
          status: resolved.status,
          currentStock: resolved.currentStock,
        };
        setSelectedFilterProduct(
          toProductOption(
            ref,
            `Stok: ${formatStockQuantity(resolved.currentStock, resolved.unit)}`,
          ),
        );

        if (isProductActiveStatus(resolved.status)) {
          setFormProductId(resolved.id);
          setSelectedFormProduct(ref);
          if (deepLink.shouldAutoOpenCreate) {
            setCreateOpen(true);
          }
        } else {
          setDeepLinkNotice(
            `Produk "${resolved.name}" (${resolved.sku}) berstatus nonaktif. Riwayat tetap ditampilkan, namun transaksi Stock In / Stock Out tidak dapat dilakukan.`,
          );
        }
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }

        if (err instanceof ApiClientError && err.status === 404) {
          setDeepLinkError("Produk dari tautan URL tidak ditemukan.");
          setDeepLinkCanRetry(false);
          return;
        }

        if (err instanceof ApiClientError && err.status === 403) {
          setStaffRestrictedProductId(deepLink.initialProductId);
          setSelectedFilterProduct(
            toProductOption(
              {
                id: deepLink.initialProductId,
                sku: deepLink.initialProductId.slice(0, 8),
                name: "Produk Nonaktif",
                unit: "-",
                status: "inactive",
              },
              "Detail katalog dibatasi untuk Staff",
            ),
          );
          setDeepLinkNotice(
            "Produk berstatus nonaktif. Riwayat pergerakan stok yang tersedia tetap ditampilkan, namun transaksi Stock In / Stock Out tidak dapat dilakukan.",
          );
          return;
        }

        setDeepLinkError(
          extractErrorMessage(
            err,
            "Gagal memuat informasi produk dari tautan URL.",
          ),
        );
        setDeepLinkCanRetry(true);
      }
    }

    void resolveDeepLinkedProduct();

    return () => {
      controller.abort();
    };
  }, [
    deepLink.initialProductId,
    deepLink.initialType,
    deepLink.invalidProductIdError,
    deepLink.shouldAutoOpenCreate,
    deepLinkRetryKey,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMovements() {
      try {
        const res = await stockMovementsService.listStockMovements({
          page,
          pageSize: 10,
          productId: productIdFilter || undefined,
          type: typeFilter || undefined,
          createdBy: createdByFilter || undefined,
          startDate: appliedRange.startDate,
          endDate: appliedRange.endDate,
          sortOrder,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setItems(res.data);
        setMeta(res.meta);
        setPageError(null);

        const observedInactive = extractObservedInactiveProducts(res.data);
        if (observedInactive.length > 0) {
          setObservedInactiveById((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const item of observedInactive) {
              if (!next[item.id]) {
                next[item.id] = item;
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }

        if (staffRestrictedProductId) {
          const matchedRow = res.data.find(
            (mov) => mov.product.id === staffRestrictedProductId,
          );
          if (matchedRow) {
            setSelectedFilterProduct(
              toProductOption({
                id: matchedRow.product.id,
                sku: matchedRow.product.sku,
                name: matchedRow.product.name,
                unit: matchedRow.product.unit,
                status: matchedRow.product.status,
              }),
            );
          }
        }
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        setPageError(
          extractErrorMessage(err, "Gagal memuat riwayat pergerakan stok."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadMovements();

    return () => {
      controller.abort();
    };
  }, [
    appliedRange.endDate,
    appliedRange.startDate,
    createdByFilter,
    page,
    productIdFilter,
    reloadKey,
    sortOrder,
    staffRestrictedProductId,
    typeFilter,
  ]);

  const fetchFilterProductsPage = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      search: string;
      signal: AbortSignal;
    }) => {
      const res = await productsService.listProducts({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: isAdmin ? "all" : "active",
        sortBy: "name",
        sortOrder: "asc",
        signal: params.signal,
      });
      return {
        options: res.data.map((p) =>
          toProductOption(
            {
              id: p.id,
              sku: p.sku,
              name: p.name,
              unit: p.unit,
              status: p.status,
              currentStock: p.currentStock,
            },
            `Stok: ${formatStockQuantity(p.currentStock, p.unit)}`,
          ),
        ),
        meta: res.meta,
      };
    },
    [isAdmin],
  );

  const fetchActiveFormProductsPage = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      search: string;
      signal: AbortSignal;
    }) => {
      const res = await productsService.listProducts({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: "active",
        sortBy: "name",
        sortOrder: "asc",
        signal: params.signal,
      });
      return {
        options: res.data.map((p) =>
          toProductOption(
            {
              id: p.id,
              sku: p.sku,
              name: p.name,
              unit: p.unit,
              status: p.status,
              currentStock: p.currentStock,
            },
            `Stok: ${formatStockQuantity(p.currentStock, p.unit)}`,
          ),
        ),
        meta: res.meta,
      };
    },
    [],
  );

  const fetchUsersPage = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      search: string;
      signal: AbortSignal;
    }) => {
      const res = await usersService.listUsers({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        sortBy: "name",
        sortOrder: "asc",
        signal: params.signal,
      });
      return {
        options: res.data.map(toUserOption),
        meta: res.meta,
      };
    },
    [],
  );

  const filterProductExtraOptions = useMemo(() => {
    const extras: ReferenceSelectOption<StockProductRef>[] = [];
    if (!isAdmin) {
      for (const ref of Object.values(observedInactiveById)) {
        extras.push(toProductOption(ref, "Produk nonaktif (dari riwayat)"));
      }
    }
    if (selectedFilterProduct) {
      extras.push(selectedFilterProduct);
    }
    return extras;
  }, [isAdmin, observedInactiveById, selectedFilterProduct]);

  const selectedFormProductOption = useMemo(
    () =>
      selectedFormProduct
        ? toProductOption(
            selectedFormProduct,
            selectedFormProduct.currentStock !== undefined
              ? `Stok: ${formatStockQuantity(selectedFormProduct.currentStock, selectedFormProduct.unit)}`
              : undefined,
          )
        : null,
    [selectedFormProduct],
  );

  function handleDateFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const range = toJakartaDateRangeIso(startDateInput, endDateInput);
    if (range.error) {
      setPageError(range.error);
      return;
    }
    setPageError(null);
    setIsLoading(true);
    setPage(1);
    setAppliedRange({ startDate: range.startDate, endDate: range.endDate });
  }

  function handleResetFilters() {
    setProductIdFilter("");
    setSelectedFilterProduct(null);
    setStaffRestrictedProductId(null);
    setDeepLinkNotice(null);
    setDeepLinkError(null);
    setTypeFilter("");
    setCreatedByFilter("");
    setSelectedCreatorOption(null);
    setStartDateInput("");
    setEndDateInput("");
    setAppliedRange({});
    setSortOrder("desc");
    setPageError(null);
    setIsLoading(true);
    setPage(1);
  }

  function openCreateModal() {
    setFormError(null);
    setFormQuantity("");
    setFormReason("");
    setFormNotes("");
    setCreateOpen(true);
  }

  const selectedProduct = selectedFormProduct;

  async function handleCreateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const validationError = validateStockMovementSubmission({
      productId: formProductId,
      selectedProduct,
      quantity: formQuantity,
      reason: formReason,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const trimmedReason = formReason.trim();

    setFormError(null);
    setIsSubmitting(true);
    const trimmedNotes = formNotes.trim();

    try {
      const created = await stockMovementsService.createStockMovement({
        productId: formProductId,
        type: formType,
        quantity: formQuantity.trim(),
        reason: trimmedReason,
        notes: trimmedNotes || null,
      });

      setCreateOpen(false);
      setFormQuantity("");
      setFormReason("");
      setFormNotes("");
      setSelectedFormProduct((prev) =>
        prev && prev.id === created.product.id
          ? { ...prev, currentStock: created.stockAfter }
          : prev,
      );
      setFeedback(
        `${created.type === "in" ? "Stock In" : "Stock Out"} ${formatStockQuantity(
          created.quantity,
          created.product.unit,
        )} untuk "${created.product.name}" berhasil dicatat (stok akhir: ${formatStockQuantity(
          created.stockAfter,
          created.product.unit,
        )}).`,
      );
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "NETWORK_ERROR") {
        setFormError(
          "Koneksi terputus saat mencatat transaksi. Periksa tabel riwayat di bawah terlebih dahulu sebelum mengirim ulang agar tidak terjadi transaksi ganda.",
        );
      } else {
        setFormError(
          extractErrorMessage(err, "Gagal mencatat pergerakan stok."),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pergerakan Stok"
        description="Catat transaksi Stock In / Stock Out secara atomik dan telusuri riwayat permanen pergerakan stok."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            + Catat Stock In / Out
          </button>
        }
      />

      {feedback ? (
        <FeedbackBanner
          variant="success"
          message={feedback}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      {deepLinkNotice ? (
        <FeedbackBanner
          variant="warning"
          message={deepLinkNotice}
          onDismiss={() => setDeepLinkNotice(null)}
        />
      ) : null}

      {deepLinkError ? (
        <div className="space-y-2">
          <FeedbackBanner
            variant="error"
            message={deepLinkError}
            onDismiss={() => setDeepLinkError(null)}
          />
          {deepLinkCanRetry ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setDeepLinkRetryKey((k) => k + 1)}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50"
              >
                Coba Lagi Muat Produk URL
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {pageError ? (
        <FeedbackBanner
          variant="error"
          message={pageError}
          onDismiss={() => setPageError(null)}
        />
      ) : null}

      {/* Filters */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={handleDateFilterSubmit}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[230px] flex-1">
            <label
              htmlFor="mov-product"
              className="block text-xs font-medium text-slate-600"
            >
              Produk
            </label>
            <SearchableSelect
              id="mov-product"
              value={productIdFilter}
              onChange={(nextId, nextOption) => {
                setIsLoading(true);
                setPage(1);
                setProductIdFilter(nextId);
                setSelectedFilterProduct(nextOption);
                if (!nextId) {
                  setStaffRestrictedProductId(null);
                  setDeepLinkNotice(null);
                }
              }}
              fetchPage={fetchFilterProductsPage}
              selectedOption={selectedFilterProduct}
              extraOptions={filterProductExtraOptions}
              allowClear
              clearLabel="Semua Produk"
              placeholder="Semua Produk"
              searchPlaceholder="Cari SKU atau nama produk..."
              emptyMessage={
                isAdmin
                  ? "Tidak ada produk yang cocok."
                  : "Produk tidak ditemukan di katalog aktif / riwayat termuat."
              }
              refreshKey={reloadKey}
            />
          </div>

          <div>
            <label
              htmlFor="mov-type"
              className="block text-xs font-medium text-slate-600"
            >
              Tipe
            </label>
            <select
              id="mov-type"
              value={typeFilter}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setTypeFilter(e.target.value as "" | StockMovementType);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="">Semua Tipe</option>
              <option value="in">Stock In</option>
              <option value="out">Stock Out</option>
            </select>
          </div>

          <div className={isAdmin ? "min-w-[210px]" : undefined}>
            <label
              htmlFor="mov-creator"
              className="block text-xs font-medium text-slate-600"
            >
              Pencatat
            </label>
            {isAdmin ? (
              <SearchableSelect
                id="mov-creator"
                value={createdByFilter}
                onChange={(nextId, nextOption) => {
                  setIsLoading(true);
                  setPage(1);
                  setCreatedByFilter(nextId);
                  setSelectedCreatorOption(nextOption);
                }}
                fetchPage={fetchUsersPage}
                selectedOption={selectedCreatorOption}
                allowClear
                clearLabel="Semua Pencatat"
                placeholder="Semua Pencatat"
                searchPlaceholder="Cari nama atau email..."
                emptyMessage="Pengguna tidak ditemukan."
                refreshKey={reloadKey}
              />
            ) : (
              <select
                id="mov-creator"
                value={createdByFilter}
                onChange={(e) => {
                  setIsLoading(true);
                  setPage(1);
                  setCreatedByFilter(e.target.value);
                }}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                <option value="">Semua Pencatat</option>
                {user ? (
                  <option value={user.id}>Transaksi Saya ({user.name})</option>
                ) : null}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="mov-start"
              className="block text-xs font-medium text-slate-600"
            >
              Dari (WIB)
            </label>
            <input
              id="mov-start"
              type="date"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="mov-end"
              className="block text-xs font-medium text-slate-600"
            >
              Sampai (WIB)
            </label>
            <input
              id="mov-end"
              type="date"
              value={endDateInput}
              onChange={(e) => setEndDateInput(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="mov-sort"
              className="block text-xs font-medium text-slate-600"
            >
              Urutan
            </label>
            <select
              id="mov-sort"
              value={sortOrder}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setSortOrder(e.target.value as SortOrder);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="desc">Terbaru</option>
              <option value="asc">Terlama</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Terapkan Tanggal
          </button>

          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Reset
          </button>
        </form>
      </section>

      {/* Immutable History Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Waktu (WIB)</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3 text-right">Sebelum → Sesudah</th>
                <th className="px-4 py-3">Alasan & Pencatat</th>
                <th className="px-4 py-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Memuat riwayat pergerakan stok...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Belum ada riwayat pergerakan stok yang cocok.
                  </td>
                </tr>
              ) : (
                items.map((mov) => (
                  <StockMovementTableRow
                    key={mov.id}
                    movement={mov}
                    onInspect={setDetailMovement}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          meta={meta}
          isLoading={isLoading}
          onPageChange={(nextPage) => {
            setIsLoading(true);
            setPage(nextPage);
          }}
        />
      </section>

      {/* Stock In / Stock Out Modal */}
      <ModalDialog
        open={createOpen}
        title="Catat Pergerakan Stok"
        description="Transaksi bersifat permanen (immutable) dan langsung memperbarui stok produk."
        onClose={() => {
          if (!isSubmitting) setCreateOpen(false);
        }}
      >
        {formError ? (
          <div className="mb-4">
            <FeedbackBanner variant="error" message={formError} />
          </div>
        ) : null}

        <form
          onSubmit={(e) => void handleCreateMovement(e)}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="mov-form-product"
              className="block text-sm font-medium text-slate-700"
            >
              Produk Aktif
            </label>
            <SearchableSelect
              id="mov-form-product"
              value={formProductId}
              onChange={(nextId, nextOption) => {
                setFormProductId(nextId);
                setSelectedFormProduct(nextOption?.data ?? null);
              }}
              fetchPage={fetchActiveFormProductsPage}
              selectedOption={selectedFormProductOption}
              placeholder="Pilih produk aktif"
              searchPlaceholder="Cari SKU atau nama produk aktif..."
              emptyMessage="Tidak ada produk aktif yang cocok."
              refreshKey={reloadKey}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="mov-form-type"
                className="block text-sm font-medium text-slate-700"
              >
                Jenis Transaksi
              </label>
              <select
                id="mov-form-type"
                value={formType}
                onChange={(e) =>
                  setFormType(e.target.value as StockMovementType)
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                <option value="in">Stock In (Masuk)</option>
                <option value="out">Stock Out (Keluar)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="mov-form-qty"
                className="block text-sm font-medium text-slate-700"
              >
                Jumlah{" "}
                {selectedProduct ? `(${selectedProduct.unit})` : ""}
              </label>
              <input
                id="mov-form-qty"
                type="text"
                inputMode="decimal"
                required
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
                placeholder={
                  selectedProduct && isCountOnlyUnit(selectedProduct.unit)
                    ? "Contoh: 10"
                    : "Contoh: 2.5"
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
              {selectedProduct ? (
                <p className="mt-1 text-xs text-slate-500">
                  {selectedProduct.currentStock !== undefined ? (
                    <>
                      Stok saat ini:{" "}
                      <span className="font-medium text-slate-700">
                        {formatStockQuantity(
                          selectedProduct.currentStock,
                          selectedProduct.unit,
                        )}
                      </span>{" "}
                      ·{" "}
                    </>
                  ) : null}
                  {isCountOnlyUnit(selectedProduct.unit)
                    ? "Wajib bilangan bulat"
                    : "Maks. 3 desimal"}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label
              htmlFor="mov-form-reason"
              className="block text-sm font-medium text-slate-700"
            >
              Alasan Transaksi
            </label>
            <input
              id="mov-form-reason"
              type="text"
              required
              maxLength={255}
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder="Contoh: Pembelian supplier / Pengiriman pesanan #102"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="mov-form-notes"
              className="block text-sm font-medium text-slate-700"
            >
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              id="mov-form-notes"
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Nomor surat jalan atau keterangan tambahan..."
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedProduct}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Transaksi"}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Immutable Detail Modal */}
      <ModalDialog
        open={detailMovement !== null}
        title="Detail Pergerakan Stok"
        onClose={() => setDetailMovement(null)}
      >
        {detailMovement ? (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Waktu (WIB)</dt>
              <dd className="font-medium text-slate-900">
                {formatDateTimeWib(detailMovement.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Produk</dt>
              <dd className="text-right font-medium text-slate-900">
                {detailMovement.product.name} ({detailMovement.product.sku})
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Tipe</dt>
              <dd>
                <StatusBadge
                  label={
                    detailMovement.type === "in" ? "Stock In" : "Stock Out"
                  }
                  tone={detailMovement.type === "in" ? "green" : "blue"}
                />
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Jumlah</dt>
              <dd className="font-semibold text-slate-900">
                {formatStockQuantity(
                  detailMovement.quantity,
                  detailMovement.product.unit,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Stok Sebelum → Sesudah</dt>
              <dd className="font-medium text-slate-900">
                {formatStockQuantity(
                  detailMovement.stockBefore,
                  detailMovement.product.unit,
                )}{" "}
                →{" "}
                {formatStockQuantity(
                  detailMovement.stockAfter,
                  detailMovement.product.unit,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Pencatat</dt>
              <dd className="font-medium text-slate-900">
                {detailMovement.createdBy.name}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Alasan</dt>
              <dd className="mt-1 rounded-lg bg-slate-50 p-2.5 text-slate-900">
                {detailMovement.reason}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Catatan</dt>
              <dd className="mt-1 rounded-lg bg-slate-50 p-2.5 text-slate-700">
                {detailMovement.notes ?? "Tidak ada catatan tambahan."}
              </dd>
            </div>
          </dl>
        ) : null}
      </ModalDialog>
    </div>
  );
}
