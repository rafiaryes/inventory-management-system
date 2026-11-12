"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackBanner } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { ModalDialog } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/errors";
import {
  formatDateTimeWib,
  formatStockQuantity,
  isCountOnlyUnit,
  toJakartaDateRangeIso,
  validateDecimalInput,
} from "@/lib/format";
import { productsService } from "@/services/products.service";
import { stockMovementsService } from "@/services/stock-movements.service";
import { usersService } from "@/services/users.service";
import type { PaginationMeta } from "@/types/api";
import type {
  ProductDto,
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

  const initialProductId = searchParams.get("productId") ?? "";
  const initialTypeParam = searchParams.get("type");
  const initialType: StockMovementType =
    initialTypeParam === "out" ? "out" : "in";

  const [items, setItems] = useState<StockMovementDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [activeProducts, setActiveProducts] = useState<ProductDto[]>([]);
  const [allFilterProducts, setAllFilterProducts] = useState<ProductDto[]>([]);
  const [userOptions, setUserOptions] = useState<UserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [productIdFilter, setProductIdFilter] = useState("");
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

  // Transaction Modal
  const [createOpen, setCreateOpen] = useState(() => Boolean(initialProductId));
  const [formProductId, setFormProductId] = useState(initialProductId);
  const [formType, setFormType] = useState<StockMovementType>(initialType);
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

  useEffect(() => {
    const controller = new AbortController();

    async function loadReferences() {
      try {
        const productsPromise = productsService.listProducts({
          page: 1,
          pageSize: 100,
          status: isAdmin ? "all" : "active",
          sortBy: "name",
          sortOrder: "asc",
          signal: controller.signal,
        });

        const usersPromise = isAdmin
          ? usersService.listUsers({
              page: 1,
              pageSize: 100,
              sortBy: "name",
              sortOrder: "asc",
              signal: controller.signal,
            })
          : Promise.resolve(null);

        const [productsRes, usersRes] = await Promise.all([
          productsPromise,
          usersPromise,
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const loadedProducts = productsRes.data;
        const onlyActive = loadedProducts.filter((p) => p.status === "active");
        setAllFilterProducts(loadedProducts);
        setActiveProducts(onlyActive);
        setFormProductId((prev) =>
          prev && onlyActive.some((p) => p.id === prev)
            ? prev
            : (onlyActive[0]?.id ?? ""),
        );

        if (usersRes) {
          setUserOptions(usersRes.data);
        }
      } catch {
        // Non-blocking reference options
      }
    }

    void loadReferences();

    return () => {
      controller.abort();
    };
  }, [isAdmin, reloadKey]);

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
    typeFilter,
  ]);

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
    setTypeFilter("");
    setCreatedByFilter("");
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
    if (!formProductId && activeProducts[0]) {
      setFormProductId(activeProducts[0].id);
    }
    setCreateOpen(true);
  }

  const selectedProduct = activeProducts.find((p) => p.id === formProductId);

  async function handleCreateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (!formProductId || !selectedProduct) {
      setFormError("Produk aktif wajib dipilih.");
      return;
    }

    const qtyErr = validateDecimalInput(formQuantity, {
      fieldLabel: "Jumlah",
      scale: 3,
      positiveOnly: true,
      countOnlyUnit: isCountOnlyUnit(selectedProduct.unit),
    });
    if (qtyErr) {
      setFormError(qtyErr);
      return;
    }

    const trimmedReason = formReason.trim();
    if (!trimmedReason) {
      setFormError("Alasan transaksi wajib diisi.");
      return;
    }

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
            disabled={activeProducts.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="mov-product"
              className="block text-xs font-medium text-slate-600"
            >
              Produk
            </label>
            <select
              id="mov-product"
              value={productIdFilter}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setProductIdFilter(e.target.value);
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="">Semua Produk</option>
              {allFilterProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                  {p.status === "inactive" ? " (Nonaktif)" : ""}
                </option>
              ))}
            </select>
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

          <div>
            <label
              htmlFor="mov-creator"
              className="block text-xs font-medium text-slate-600"
            >
              Pencatat
            </label>
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
              {isAdmin ? (
                userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))
              ) : user ? (
                <option value={user.id}>Transaksi Saya ({user.name})</option>
              ) : null}
            </select>
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
                  <tr key={mov.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {formatDateTimeWib(mov.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {mov.product.name}
                        </span>
                        {mov.product.status === "inactive" ? (
                          <StatusBadge label="Nonaktif" tone="slate" />
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {mov.product.sku}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge
                        label={mov.type === "in" ? "Stock In" : "Stock Out"}
                        tone={mov.type === "in" ? "green" : "blue"}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">
                      {formatStockQuantity(mov.quantity, mov.product.unit)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-600">
                      {formatStockQuantity(mov.stockBefore)} →{" "}
                      <span className="font-semibold text-slate-900">
                        {formatStockQuantity(mov.stockAfter, mov.product.unit)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{mov.reason}</div>
                      <div className="text-xs text-slate-500">
                        Oleh: {mov.createdBy.name}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailMovement(mov)}
                        className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
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
            <select
              id="mov-form-product"
              required
              value={formProductId}
              onChange={(e) => setFormProductId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              {activeProducts.length === 0 ? (
                <option value="">Tidak ada produk aktif</option>
              ) : (
                activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} (Stok:{" "}
                    {formatStockQuantity(p.currentStock, p.unit)})
                  </option>
                ))
              )}
            </select>
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
                  Stok saat ini:{" "}
                  <span className="font-medium text-slate-700">
                    {formatStockQuantity(
                      selectedProduct.currentStock,
                      selectedProduct.unit,
                    )}
                  </span>{" "}
                  ·{" "}
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
                {formatStockQuantity(detailMovement.stockBefore)} →{" "}
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
