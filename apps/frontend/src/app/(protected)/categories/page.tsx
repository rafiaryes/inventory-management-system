"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";

export default function CategoriesPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kategori Produk"
        description={
          user?.role === "admin"
            ? "Kelola pengelompokan kategori produk dan status aktifnya."
            : "Lihat daftar kategori aktif di gudang."
        }
      />
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Halaman kategori siap untuk implementasi daftar dan CRUD Admin pada
          Tahap 7.
        </p>
      </section>
    </div>
  );
}
