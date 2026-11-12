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
import { usersService, type UserSortField } from "@/services/users.service";
import type { PaginationMeta } from "@/types/api";
import type { UserRole } from "@/types/auth";
import type { SortOrder, UserDto } from "@/types/inventory";

type ActiveFilter = "all" | "active" | "inactive";

const DEFAULT_META: PaginationMeta = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 0,
};

export function UsersView() {
  const { user: currentUser } = useAuth();

  const [items, setItems] = useState<UserDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(DEFAULT_META);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sortBy, setSortBy] = useState<UserSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);

  // Create / Edit User modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("staff");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Reset Password modal
  const [resetTarget, setResetTarget] = useState<UserDto | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const isActiveParam =
      activeFilter === "all" ? undefined : activeFilter === "active";

    async function load() {
      try {
        const res = await usersService.listUsers({
          page,
          pageSize: 10,
          search: searchQuery || undefined,
          role: roleFilter || undefined,
          isActive: isActiveParam,
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
        setPageError(extractErrorMessage(err, "Gagal memuat daftar pengguna."));
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
  }, [activeFilter, page, reloadKey, roleFilter, searchQuery, sortBy, sortOrder]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setPage(1);
    setSearchQuery(searchInput.trim());
  }

  function openCreateModal() {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("staff");
    setFormError(null);
    setUserModalOpen(true);
  }

  function openEditModal(target: UserDto) {
    setEditingUser(target);
    setFormName(target.name);
    setFormEmail(target.email);
    setFormPassword("");
    setFormRole(target.role);
    setFormError(null);
    setUserModalOpen(true);
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingUser) {
      return;
    }

    const trimmedName = formName.trim();
    const normalizedEmail = formEmail.trim().toLowerCase();

    if (!trimmedName) {
      setFormError("Nama pengguna wajib diisi.");
      return;
    }
    if (!normalizedEmail) {
      setFormError("Email wajib diisi.");
      return;
    }

    if (!editingUser && (formPassword.length < 8 || formPassword.length > 128)) {
      setFormError("Kata sandi harus terdiri dari 8 sampai 128 karakter.");
      return;
    }

    setFormError(null);
    setIsSavingUser(true);

    try {
      if (editingUser) {
        await usersService.updateUser(editingUser.id, {
          name: trimmedName,
          email: normalizedEmail,
          role: editingUser.id === currentUser?.id ? undefined : formRole,
        });
        setFeedback(`Pengguna "${trimmedName}" berhasil diperbarui.`);
      } else {
        await usersService.createUser({
          name: trimmedName,
          email: normalizedEmail,
          password: formPassword,
          role: formRole,
        });
        setFeedback(`Pengguna "${trimmedName}" berhasil dibuat.`);
      }
      setUserModalOpen(false);
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Gagal menyimpan pengguna."));
    } finally {
      setIsSavingUser(false);
    }
  }

  async function handleToggleStatus(target: UserDto) {
    if (togglingId || target.id === currentUser?.id) {
      return;
    }
    setTogglingId(target.id);
    setPageError(null);

    try {
      const nextActive = !target.isActive;
      await usersService.updateUserStatus(target.id, nextActive);
      setFeedback(
        `Akun "${target.name}" berhasil ${
          nextActive ? "diaktifkan" : "dinonaktifkan dan seluruh sesinya dicabut"
        }.`,
      );
      setIsLoading(true);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setPageError(extractErrorMessage(err, "Gagal mengubah status pengguna."));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget || isResetting) {
      return;
    }
    if (resetPasswordValue.length < 8 || resetPasswordValue.length > 128) {
      setResetError("Kata sandi baru harus terdiri dari 8 sampai 128 karakter.");
      return;
    }

    setResetError(null);
    setIsResetting(true);

    try {
      await usersService.resetPassword(resetTarget.id, resetPasswordValue);
      setFeedback(
        `Kata sandi "${resetTarget.name}" berhasil direset dan seluruh sesi aktifnya dicabut.`,
      );
      setResetTarget(null);
      setResetPasswordValue("");
    } catch (err) {
      setResetError(extractErrorMessage(err, "Gagal mereset kata sandi."));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Pengguna"
        description="Kelola akun Admin dan Staff, status aktif, serta reset kata sandi."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            + Tambah Pengguna
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
          onSubmit={handleSearchSubmit}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="user-search"
              className="block text-xs font-medium text-slate-600"
            >
              Cari Nama / Email
            </label>
            <input
              id="user-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nama atau email..."
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="user-role"
              className="block text-xs font-medium text-slate-600"
            >
              Role
            </label>
            <select
              id="user-role"
              value={roleFilter}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setRoleFilter(e.target.value as "" | UserRole);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="">Semua Role</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="user-status"
              className="block text-xs font-medium text-slate-600"
            >
              Status
            </label>
            <select
              id="user-status"
              value={activeFilter}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setActiveFilter(e.target.value as ActiveFilter);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">Semua</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="user-sort"
              className="block text-xs font-medium text-slate-600"
            >
              Urutkan
            </label>
            <select
              id="user-sort"
              value={sortBy}
              onChange={(e) => {
                setIsLoading(true);
                setPage(1);
                setSortBy(e.target.value as UserSortField);
              }}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="createdAt">Tanggal Dibuat</option>
              <option value="name">Nama</option>
              <option value="email">Email</option>
              <option value="role">Role</option>
              <option value="isActive">Status</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="user-order"
              className="block text-xs font-medium text-slate-600"
            >
              Arah
            </label>
            <select
              id="user-order"
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

          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cari
          </button>
        </form>
      </section>

      {/* Users Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Dibuat (WIB)</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Memuat daftar pengguna...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Tidak ada pengguna yang ditemukan.
                  </td>
                </tr>
              ) : (
                items.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {u.name}{" "}
                        {isSelf ? (
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            (Anda)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{u.email}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge
                          label={u.role === "admin" ? "Admin" : "Staff"}
                          tone={u.role === "admin" ? "blue" : "slate"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge
                          label={u.isActive ? "Aktif" : "Nonaktif"}
                          tone={u.isActive ? "green" : "rose"}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatDateTimeWib(u.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetTarget(u);
                              setResetPasswordValue("");
                              setResetError(null);
                            }}
                            className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
                          >
                            Reset Password
                          </button>
                          <button
                            type="button"
                            disabled={isSelf || togglingId === u.id}
                            onClick={() => void handleToggleStatus(u)}
                            title={
                              isSelf
                                ? "Anda tidak dapat menonaktifkan akun sendiri"
                                : undefined
                            }
                            className="text-xs font-medium text-slate-600 underline hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {togglingId === u.id
                              ? "..."
                              : u.isActive
                                ? "Nonaktifkan"
                                : "Aktifkan"}
                          </button>
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

      {/* Create / Edit Modal */}
      <ModalDialog
        open={userModalOpen}
        title={editingUser ? "Edit Pengguna" : "Tambah Pengguna Baru"}
        onClose={() => {
          if (!isSavingUser) setUserModalOpen(false);
        }}
      >
        {formError ? (
          <div className="mb-4">
            <FeedbackBanner variant="error" message={formError} />
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSaveUser(e)} className="space-y-4">
          <div>
            <label
              htmlFor="user-form-name"
              className="block text-sm font-medium text-slate-700"
            >
              Nama Lengkap
            </label>
            <input
              id="user-form-name"
              type="text"
              required
              maxLength={150}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="user-form-email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="user-form-email"
              type="email"
              required
              maxLength={255}
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          {!editingUser ? (
            <div>
              <label
                htmlFor="user-form-password"
                className="block text-sm font-medium text-slate-700"
              >
                Kata Sandi
              </label>
              <input
                id="user-form-password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>
          ) : null}

          <div>
            <label
              htmlFor="user-form-role"
              className="block text-sm font-medium text-slate-700"
            >
              Role
            </label>
            <select
              id="user-form-role"
              value={formRole}
              disabled={editingUser?.id === currentUser?.id}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-100"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            {editingUser?.id === currentUser?.id ? (
              <p className="mt-1 text-xs text-slate-500">
                Anda tidak dapat mengubah role akun sendiri.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSavingUser}
              onClick={() => setUserModalOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingUser}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSavingUser ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Reset Password Modal */}
      <ModalDialog
        open={resetTarget !== null}
        title="Reset Kata Sandi Pengguna"
        description={
          resetTarget
            ? `Mereset kata sandi ${resetTarget.name} (${resetTarget.email}) akan langsung mencabut seluruh sesi aktif pengguna tersebut.`
            : undefined
        }
        onClose={() => {
          if (!isResetting) setResetTarget(null);
        }}
      >
        {resetError ? (
          <div className="mb-4">
            <FeedbackBanner variant="error" message={resetError} />
          </div>
        ) : null}

        <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-4">
          <div>
            <label
              htmlFor="reset-new-password"
              className="block text-sm font-medium text-slate-700"
            >
              Kata Sandi Baru
            </label>
            <input
              id="reset-new-password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              placeholder="8-128 karakter"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setResetTarget(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isResetting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isResetting ? "Memproses..." : "Reset Kata Sandi"}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
