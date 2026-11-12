"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackBanner } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { ModalDialog } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination";
import { useAuth } from "@/hooks/use-auth";
import { extractErrorMessage } from "@/lib/errors";
import { formatDateTimeWib } from "@/lib/format";
import {
  categoriesService,
  type CategorySortField,
} from "@/services/categories.service";
import type { PaginationMeta } from "@/types/api";
import type { CategoryDto, SortOrder } from "@/types/inventory";

type StatusFilterValue = "all" | "active" | "inactive";

const DEFAULT_META: PaginationMeta = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 0,
};

export function CategoriesView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState<CategoryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(
    isAdmin ? "all" : "active",
  );
  const [sortBy, setSortBy] = useState<CategorySortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(
    null,
  );
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const effectiveIsActive = isAdmin
      ? statusFilter === "all"
        ? undefined
        : statusFilter === "active"
      : true;

    async function load() {
      try {
        const res = await categoriesService.listCategories({
          page,
          pageSize: 10,
          search: searchQuery || undefined,
          isActive: effectiveIsActive,
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
        setPageError(extractErrorMessage(err, "Gagal memuat data kategori."));
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
  }, [isAdmin, page, reloadKey, searchQuery, sortBy, sortOrder, statusFilter]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setPage(1);
    setSearchQuery(searchInput.trim());
  }

  function openCreateModal() {
    setEditingCategory(null);
    setFormName("");
    setFormDescription("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(category: CategoryDto) {
    setEditingCategory(category);
    setFormName(category.name);
    setFormDescription(category.description ?? "");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("Nama kategori wajib diisi.");
      return;
    }

    setFormError(null);
    setIsSaving(true);
    const trimmedDescription = formDescription.trim();

    try {
      if (editingCategory) {
        await categoriesService.updateCategory(editingCategory.id, {
          name: trimmedName,
          description: trimmedDescription || null,
        });
        setFeedback(`Kategori "${trimmedName}" berhasil diperbarui.`);
      } else {
        await categoriesService.createCategory({
          name: trimmedName,
          description: trimmedDescription || null,
        });
        setFeedback(`Kategori "${trimmedName}" berhasil dibuat.`);
      }
      setModalOpen(false);
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Gagal menyimpan kategori."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(category: CategoryDto) {
    if (togglingId) {
      return;
    }
    setTogglingId(category.id);
    setPageError(null);

    try {
      const nextActive = !category.isActive;
      await categoriesService.updateCategoryStatus(category.id, nextActive);
      setFeedback(
        `Kategori "${category.name}" berhasil ${
          nextActive ? "diaktifkan" : "dinonaktifkan"
        }.`,
      );
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setPageError(extractErrorMessage(err, "Gagal mengubah status kategori."));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kategori Produk"
        description={
          isAdmin
            ? "Kelola pengelompokan kategori produk dan status aktifnya."
            : "Daftar kategori aktif yang tersedia di gudang."
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              + Tambah Kategori
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

      {/* Filter Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="cat-search"
              className="block text-xs font-medium text-slate-600"
            >
              Cari Kategori
            </label>
            <input
              id="cat-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nama atau deskripsi..."
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          {isAdmin ? (
            <div>
              <label
                htmlFor="cat-status"
                className="block text-xs font-medium text-slate-600"
              >
                Status
              </label>
              <select
                id="cat-status"
                value={statusFilter}
                onChange={(e) => {
                  setIsLoading(true);
                  setPage(1);
                  setStatusFilter(e.target.value as StatusFilterValue);
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
              htmlFor="cat-sort-by"
              className="block text-xs font-medium text-slate-600"
            >
              Urutkan
            </label>
            <select
              id="cat-sort-by"
              value={sortBy}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setSortBy(e.target.value as CategorySortField);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="createdAt">Tanggal Dibuat</option>
              <option value="name">Nama</option>
              <option value="updatedAt">Terakhir Diubah</option>
              {isAdmin ? <option value="isActive">Status</option> : null}
            </select>
          </div>

          <div>
            <label
              htmlFor="cat-sort-order"
              className="block text-xs font-medium text-slate-600"
            >
              Arah
            </label>
            <select
              id="cat-sort-order"
              value={sortOrder}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setSortOrder(e.target.value as SortOrder);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="desc">Terbaru / Z-A</option>
              <option value="asc">Terlama / A-Z</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Terapkan
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama Kategori</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Diperbarui (WIB)</th>
                {isAdmin ? <th className="px-4 py-3 text-right">Aksi</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 5 : 4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Memuat data kategori...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 5 : 4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Tidak ada kategori yang ditemukan.
                  </td>
                </tr>
              ) : (
                items.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {cat.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cat.description ?? (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge
                        label={cat.isActive ? "Aktif" : "Nonaktif"}
                        tone={cat.isActive ? "green" : "slate"}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {formatDateTimeWib(cat.updatedAt)}
                    </td>
                    {isAdmin ? (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEditModal(cat)}
                            className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={togglingId === cat.id}
                            onClick={() => void handleToggleStatus(cat)}
                            className="text-xs font-medium text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
                          >
                            {togglingId === cat.id
                              ? "Memproses..."
                              : cat.isActive
                                ? "Nonaktifkan"
                                : "Aktifkan"}
                          </button>
                        </div>
                      </td>
                    ) : null}
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

      {/* Admin Create / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        title={editingCategory ? "Edit Kategori" : "Tambah Kategori"}
        description="Nama kategori bersifat unik (case-insensitive)."
        onClose={() => {
          if (!isSaving) setModalOpen(false);
        }}
      >
        {formError ? (
          <div className="mb-4">
            <FeedbackBanner variant="error" message={formError} />
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSaveCategory(e)} className="space-y-4">
          <div>
            <label
              htmlFor="modal-cat-name"
              className="block text-sm font-medium text-slate-700"
            >
              Nama Kategori
            </label>
            <input
              id="modal-cat-name"
              type="text"
              required
              maxLength={100}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Contoh: Elektronik"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="modal-cat-desc"
              className="block text-sm font-medium text-slate-700"
            >
              Deskripsi (Opsional)
            </label>
            <textarea
              id="modal-cat-desc"
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Keterangan singkat kategori..."
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
    </div>
  );
}
