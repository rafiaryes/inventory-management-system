"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Inventaris"
        description="Ringkasan operasional produk, kategori, stok menipis, dan pergerakan bulan berjalan."
      />
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          Login aktif sebagai{" "}
          <span className="font-semibold text-slate-900">{user?.name}</span> (
          <span className="font-mono text-xs">{user?.role}</span>). Shell
          dashboard siap untuk integrasi modul fitur bisnis pada Tahap 7.
        </p>
      </section>
    </div>
  );
}
