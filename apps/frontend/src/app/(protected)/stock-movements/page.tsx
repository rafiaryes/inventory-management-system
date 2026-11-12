"use client";

import { PageHeader } from "@/components/layout/page-header";

export default function StockMovementsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pergerakan Stok"
        description="Catat transaksi Stock In / Stock Out dan telusuri riwayat pergerakan stok."
      />
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Halaman pergerakan stok siap untuk implementasi transaksi dan filter
          riwayat pada Tahap 7.
        </p>
      </section>
    </div>
  );
}
