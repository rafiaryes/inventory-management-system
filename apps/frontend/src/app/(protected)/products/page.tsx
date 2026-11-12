"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";

export default function ProductsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Produk"
        description={
          user?.role === "admin"
            ? "Kelola katalog produk, harga beli/jual, stok minimum, dan status aktif."
            : "Lihat daftar produk aktif dan informasi stok gudang."
        }
      />
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Halaman produk siap untuk implementasi daftar, filter, dan manajemen
          pada Tahap 7.
        </p>
      </section>
    </div>
  );
}
