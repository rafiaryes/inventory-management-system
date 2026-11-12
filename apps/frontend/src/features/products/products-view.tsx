"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackBanner } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { ModalDialog } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ProductDetailModalContent } from "@/features/products/product-detail-modal-content";
import { useAuth } from "@/hooks/use-auth";
import { extractErrorMessage } from "@/lib/errors";
import {
  formatCurrencyIdr,
  formatStockQuantity,
  isCountOnlyUnit,
  isDecimalLessThanOrEqual,
  validateDecimalInput,
} from "@/lib/format";
import {
  toCategoryOption,
  type ReferenceSelectOption,
} from "@/lib/reference-helpers";
import { categoriesService } from "@/services/categories.service";
import {
  productsService,
  type ProductSortField,
  type ProductStatusFilter,
} from "@/services/products.service";
import type { PaginationMeta } from "@/types/api";
import {
  isAdminProductDto,
  type CategoryDto,
  type ProductAdminDto,
  type ProductDto,
  type SortOrder,
} from "@/types/inventory";

const DEFAULT_META: PaginationMeta = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 0,
};

export function ProductsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState<ProductDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [selectedFilterCategory, setSelectedFilterCategory] =
    useState<ReferenceSelectOption<Pick<CategoryDto, "id" | "name" | "isActive">> | null>(
      null,
    );
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>(
    isAdmin ? "all" : "active",
  );
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<ProductSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Detail Modal (Admin & Staff)
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetryKey, setDetailRetryKey] = useState(0);

  // Modal state (Admin only)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductAdminDto | null>(
    null,
  );
  const [formCategoryId, setFormCategoryId] = useState("");
  const [selectedFormCategory, setSelectedFormCategory] =
    useState<ReferenceSelectOption<Pick<CategoryDto, "id" | "name" | "isActive">> | null>(
      null,
    );
  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnit, setFormUnit] = useState("pcs");
  const [formPurchasePrice, setFormPurchasePrice] = useState("");
  const [formSellingPrice, setFormSellingPrice] = useState("");
  const [formMinimumStock, setFormMinimumStock] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchActiveCategoryPage = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      search: string;
      signal: AbortSignal;
    }) => {
      const res = await categoriesService.listCategories({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        isActive: true,
        sortBy: "name",
        sortOrder: "asc",
        signal: params.signal,
      });
      return {
        options: res.data.map(toCategoryOption),
        meta: res.meta,
      };
    },
    [],
  );

  useEffect(() => {
    if (!detailTargetId) {
      return;
    }

    const controller = new AbortController();

    async function loadProductDetail() {
      try {
        const fetched = await productsService.getProductById(
          detailTargetId!,
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        setDetailProduct(fetched);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        setDetailProduct(null);
        setDetailError(
          extractErrorMessage(err, "Gagal memuat detail produk."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    }

    void loadProductDetail();

    return () => {
      controller.abort();
    };
  }, [detailRetryKey, detailTargetId]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await productsService.listProducts({
          page,
          pageSize: 10,
          search: searchQuery || undefined,
          categoryId: categoryFilter || undefined,
          status: isAdmin ? statusFilter : "active",
          lowStock: lowStockOnly ? true : undefined,
          sortBy,
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
        setPageError(extractErrorMessage(err, "Gagal memuat daftar produk."));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [
    categoryFilter,
    isAdmin,
    lowStockOnly,
    page,
    reloadKey,
    searchQuery,
    sortBy,
    sortOrder,
    statusFilter,
  ]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setPage(1);
    setSearchQuery(searchInput.trim());
  }

  function openDetailModal(product: ProductDto) {
    setDetailProduct(product);
    setDetailLoading(true);
    setDetailError(null);
    setDetailTargetId(product.id);
    setDetailRetryKey((k) => k + 1);
  }

  function closeDetailModal() {
    setDetailTargetId(null);
    setDetailProduct(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  function openCreateModal() {
    setEditingProduct(null);
    setFormCategoryId("");
    setSelectedFormCategory(null);
    setFormSku("");
    setFormName("");
    setFormDescription("");
    setFormUnit("pcs");
    setFormPurchasePrice("");
    setFormSellingPrice("");
    setFormMinimumStock("0");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(product: ProductAdminDto) {
    setEditingProduct(product);
    setFormCategoryId(product.category.id);
    setSelectedFormCategory(
      toCategoryOption({
        id: product.category.id,
        name: product.category.name,
        isActive: true,
      }),
    );
    setFormSku(product.sku);
    setFormName(product.name);
    setFormDescription(product.description ?? "");
    setFormUnit(product.unit);
    setFormPurchasePrice(product.purchasePrice);
    setFormSellingPrice(product.sellingPrice);
    setFormMinimumStock(product.minimumStock);
    setFormError(null);
    setModalOpen(true);
  }

  const editingCategoryFallbackOptions = useMemo(() => {
    if (!editingProduct) {
      return [];
    }
    return [
      toCategoryOption({
        id: editingProduct.category.id,
        name: editingProduct.category.name,
        isActive: true,
      }),
    ];
  }, [editingProduct]);

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const normalizedSku = formSku.trim().toUpperCase();
    const trimmedName = formName.trim();
    const normalizedUnit = formUnit.trim().toLowerCase();

    if (!formCategoryId) {
      setFormError("Kategori wajib dipilih.");
      return;
    }
    if (!normalizedSku || !/^[A-Z0-9-]+$/.test(normalizedSku)) {
      setFormError("SKU hanya boleh berisi huruf, angka, dan tanda hubung (-).");
      return;
    }
    if (!trimmedName) {
      setFormError("Nama produk wajib diisi.");
      return;
    }
    if (!normalizedUnit) {
      setFormError("Satuan unit wajib diisi.");
      return;
    }

    const purchaseErr = validateDecimalInput(formPurchasePrice, {
      fieldLabel: "Harga beli",
      scale: 2,
    });
    if (purchaseErr) {
      setFormError(purchaseErr);
      return;
    }

    const sellingErr = validateDecimalInput(formSellingPrice, {
      fieldLabel: "Harga jual",
      scale: 2,
    });
    if (sellingErr) {
      setFormError(sellingErr);
      return;
    }

    const minStockValue = formMinimumStock.trim() || "0";
    const minStockErr = validateDecimalInput(minStockValue, {
      fieldLabel: "Stok minimum",
      scale: 3,
      countOnlyUnit: isCountOnlyUnit(normalizedUnit),
    });
    if (minStockErr) {
      setFormError(minStockErr);
      return;
    }

    setFormError(null);
    setIsSaving(true);
    const trimmedDesc = formDescription.trim();

    try {
      if (editingProduct) {
        const changes: Parameters<typeof productsService.updateProduct>[1] = {
          sku: normalizedSku,
          name: trimmedName,
          description: trimmedDesc || null,
          purchasePrice: formPurchasePrice.trim(),
          sellingPrice: formSellingPrice.trim(),
          minimumStock: minStockValue,
        };
        if (formCategoryId !== editingProduct.category.id) {
          changes.categoryId = formCategoryId;
        }
        if (normalizedUnit !== editingProduct.unit) {
          changes.unit = normalizedUnit;
        }
        await productsService.updateProduct(editingProduct.id, changes);
        setFeedback(`Produk "${trimmedName}" (${normalizedSku}) berhasil diperbarui.`);
      } else {
        await productsService.createProduct({
          categoryId: formCategoryId,
          sku: normalizedSku,
          name: trimmedName,
          description: trimmedDesc || null,
          unit: normalizedUnit,
          purchasePrice: formPurchasePrice.trim(),
          sellingPrice: formSellingPrice.trim(),
          minimumStock: minStockValue,
        });
        setFeedback(`Produk "${trimmedName}" (${normalizedSku}) berhasil dibuat.`);
      }
      setModalOpen(false);
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Gagal menyimpan produk."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(product: ProductAdminDto) {
    if (togglingId) {
      return;
    }
    setTogglingId(product.id);
    setPageError(null);

    try {
      const nextStatus = product.status === "active" ? "inactive" : "active";
      await productsService.updateProductStatus(product.id, nextStatus);
      setFeedback(
        `Produk "${product.name}" berhasil ${
          nextStatus === "active" ? "diaktifkan" : "dinonaktifkan"
        }.`,
      );
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setPageError(extractErrorMessage(err, "Gagal mengubah status produk."));
    } finally {
      setTogglingId(null);
    }
  }

  const columnCount = isAdmin ? 8 : 5;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Produk"
        description={
          isAdmin
            ? "Kelola katalog produk, kategori, harga beli/jual, stok minimum, dan status."
            : "Daftar produk aktif dan pantauan ketersediaan stok gudang."
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              + Tambah Produk
            </button>
          ) : null
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

      {/* Filter bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="prod-search"
              className="block text-xs font-medium text-slate-600"
            >
              Cari Produk / SKU
            </label>
            <input
              id="prod-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nama produk atau SKU..."
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="min-w-[210px]">
            <label
              htmlFor="prod-category"
              className="block text-xs font-medium text-slate-600"
            >
              Kategori
            </label>
            <SearchableSelect
              id="prod-category"
              value={categoryFilter}
              onChange={(nextId, nextOption) => {
                setIsLoading(true);
                setPage(1);
                setCategoryFilter(nextId);
                setSelectedFilterCategory(nextOption);
              }}
              fetchPage={fetchActiveCategoryPage}
              selectedOption={selectedFilterCategory}
              allowClear
              clearLabel="Semua Kategori Aktif"
              placeholder="Semua Kategori Aktif"
              searchPlaceholder="Cari kategori..."
              emptyMessage="Tidak ada kategori aktif yang cocok."
              refreshKey={reloadKey}
            />
          </div>

          {isAdmin ? (
            <div>
              <label
                htmlFor="prod-status"
                className="block text-xs font-medium text-slate-600"
              >
                Status
              </label>
              <select
                id="prod-status"
                value={statusFilter}
                onChange={(e) => {
                  setIsLoading(true);
                  setPage(1);
                  setStatusFilter(e.target.value as ProductStatusFilter);
                }}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                <option value="all">Semua</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="prod-sort-by"
              className="block text-xs font-medium text-slate-600"
            >
              Urutkan
            </label>
            <select
              id="prod-sort-by"
              value={sortBy}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setSortBy(e.target.value as ProductSortField);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="createdAt">Tanggal Dibuat</option>
              <option value="name">Nama</option>
              <option value="sku">SKU</option>
              <option value="currentStock">Stok Saat Ini</option>
              <option value="minimumStock">Stok Minimum</option>
              {isAdmin ? <option value="purchasePrice">Harga Beli</option> : null}
              {isAdmin ? <option value="sellingPrice">Harga Jual</option> : null}
              {isAdmin ? <option value="status">Status</option> : null}
            </select>
          </div>

          <div>
            <label
              htmlFor="prod-sort-order"
              className="block text-xs font-medium text-slate-600"
            >
              Arah
            </label>
            <select
              id="prod-sort-order"
              value={sortOrder}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setSortOrder(e.target.value as SortOrder);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="desc">Menurun</option>
              <option value="asc">Menaik</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setLowStockOnly(e.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>Stok Menipis</span>
          </label>

          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cari
          </button>
        </form>
      </section>

      {/* Products Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">Stok / Min</th>
                {isAdmin ? (
                  <>
                    <th className="px-4 py-3 text-right">Harga Beli</th>
                    <th className="px-4 py-3 text-right">Harga Jual</th>
                    <th className="px-4 py-3">Status</th>
                  </>
                ) : null}
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Memuat daftar produk...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Tidak ada produk yang ditemukan.
                  </td>
                </tr>
              ) : (
                items.map((product) => {
                  const isLow =
                    product.status === "active" &&
                    isDecimalLessThanOrEqual(
                      product.currentStock,
                      product.minimumStock,
                    );

                  return (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                        {product.sku}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {product.name}
                        </div>
                        {product.description ? (
                          <div className="max-w-xs truncate text-xs text-slate-500">
                            {product.description}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {product.category.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isLow ? (
                            <StatusBadge label="Menipis" tone="amber" />
                          ) : null}
                          <span className="font-medium text-slate-900">
                            {formatStockQuantity(
                              product.currentStock,
                              product.unit,
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Min:{" "}
                          {formatStockQuantity(
                            product.minimumStock,
                            product.unit,
                          )}
                        </div>
                      </td>

                      {isAdmin && isAdminProductDto(product) ? (
                        <>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                            {formatCurrencyIdr(product.purchasePrice)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">
                            {formatCurrencyIdr(product.sellingPrice)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusBadge
                              label={
                                product.status === "active"
                                  ? "Aktif"
                                  : "Nonaktif"
                              }
                              tone={
                                product.status === "active" ? "green" : "slate"
                              }
                            />
                          </td>
                        </>
                      ) : null}

                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openDetailModal(product)}
                            className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
                          >
                            Detail
                          </button>
                          {product.status === "active" ? (
                            <Link
                              href={`/stock-movements?productId=${product.id}`}
                              className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900"
                            >
                              Catat Stok
                            </Link>
                          ) : null}
                          {isAdmin && isAdminProductDto(product) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(product)}
                                className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={togglingId === product.id}
                                onClick={() => void handleToggleStatus(product)}
                                className="text-xs font-medium text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
                              >
                                {togglingId === product.id
                                  ? "..."
                                  : product.status === "active"
                                    ? "Nonaktifkan"
                                    : "Aktifkan"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* Admin Create / Edit Modal */}
      {isAdmin ? (
        <ModalDialog
          open={modalOpen}
          title={editingProduct ? "Edit Produk" : "Tambah Produk Baru"}
          description={
            editingProduct
              ? "Perubahan satuan unit hanya diizinkan saat stok 0 dan belum ada riwayat transaksi."
              : "Produk baru selalu dimulai dengan stok 0. Tambahkan stok awal melalui Stock In."
          }
          onClose={() => {
            if (!isSaving) setModalOpen(false);
          }}
        >
          {formError ? (
            <div className="mb-4">
              <FeedbackBanner variant="error" message={formError} />
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSaveProduct(e)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="prod-form-sku"
                  className="block text-sm font-medium text-slate-700"
                >
                  SKU
                </label>
                <input
                  id="prod-form-sku"
                  type="text"
                  required
                  maxLength={50}
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value.toUpperCase())}
                  placeholder="BRG-001"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-form-cat"
                  className="block text-sm font-medium text-slate-700"
                >
                  Kategori
                </label>
                <SearchableSelect
                  id="prod-form-cat"
                  value={formCategoryId}
                  onChange={(nextId, nextOption) => {
                    setFormCategoryId(nextId);
                    setSelectedFormCategory(nextOption);
                  }}
                  fetchPage={fetchActiveCategoryPage}
                  selectedOption={selectedFormCategory}
                  extraOptions={editingCategoryFallbackOptions}
                  placeholder="Pilih kategori aktif"
                  searchPlaceholder="Cari kategori aktif..."
                  emptyMessage="Kategori aktif tidak ditemukan."
                  refreshKey={reloadKey}
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="prod-form-name"
                className="block text-sm font-medium text-slate-700"
              >
                Nama Produk
              </label>
              <input
                id="prod-form-name"
                type="text"
                required
                maxLength={150}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Mouse Wireless Office"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="prod-form-unit"
                  className="block text-sm font-medium text-slate-700"
                >
                  Satuan Unit
                </label>
                <input
                  id="prod-form-unit"
                  type="text"
                  required
                  maxLength={30}
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value.toLowerCase())}
                  placeholder="pcs / box / kg / liter"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lowercase outline-none focus:border-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {isCountOnlyUnit(formUnit)
                    ? "Satuan hitungan: stok minimum & transaksi harus bilangan bulat."
                    : "Mendukung hingga 3 angka desimal."}
                </p>
              </div>

              <div>
                <label
                  htmlFor="prod-form-min-stock"
                  className="block text-sm font-medium text-slate-700"
                >
                  Stok Minimum
                </label>
                <input
                  id="prod-form-min-stock"
                  type="text"
                  inputMode="decimal"
                  value={formMinimumStock}
                  onChange={(e) => setFormMinimumStock(e.target.value)}
                  placeholder="0"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="prod-form-purchase"
                  className="block text-sm font-medium text-slate-700"
                >
                  Harga Beli (IDR)
                </label>
                <input
                  id="prod-form-purchase"
                  type="text"
                  inputMode="decimal"
                  required
                  value={formPurchasePrice}
                  onChange={(e) => setFormPurchasePrice(e.target.value)}
                  placeholder="50000.00"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="prod-form-selling"
                  className="block text-sm font-medium text-slate-700"
                >
                  Harga Jual (IDR)
                </label>
                <input
                  id="prod-form-selling"
                  type="text"
                  inputMode="decimal"
                  required
                  value={formSellingPrice}
                  onChange={(e) => setFormSellingPrice(e.target.value)}
                  placeholder="75000.00"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="prod-form-desc"
                className="block text-sm font-medium text-slate-700"
              >
                Deskripsi (Opsional)
              </label>
              <textarea
                id="prod-form-desc"
                rows={2}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Catatan spesifikasi produk..."
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {isSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </ModalDialog>
      ) : null}

      {/* Product Detail Modal (Admin & Staff) */}
      <ModalDialog
        open={detailTargetId !== null}
        title="Detail Produk"
        description={
          detailProduct
            ? `${detailProduct.sku} · ${detailProduct.category.name}`
            : undefined
        }
        onClose={closeDetailModal}
      >
        <ProductDetailModalContent
          isAdmin={isAdmin}
          loading={detailLoading}
          error={detailError}
          product={detailProduct}
          onRetry={() => {
            setDetailLoading(true);
            setDetailError(null);
            setDetailRetryKey((k) => k + 1);
          }}
        />
      </ModalDialog>
    </div>
  );
}
