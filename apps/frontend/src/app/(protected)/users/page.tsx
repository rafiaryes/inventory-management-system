"use client";

import { RequireAuth } from "@/components/auth/auth-guard";
import { PageHeader } from "@/components/layout/page-header";

export default function UsersPage() {
  return (
    <RequireAuth allowedRoles={["admin"]}>
      <div className="space-y-6">
        <PageHeader
          title="Manajemen Pengguna"
          description="Kelola akun Admin dan Staff, status aktif, serta reset kata sandi."
        />
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Halaman pengguna (Admin-only) siap untuk implementasi CRUD pada Tahap
            7.
          </p>
        </section>
      </div>
    </RequireAuth>
  );
}
