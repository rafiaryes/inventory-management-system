"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { FeedbackBanner } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { extractErrorMessage } from "@/lib/errors";
import { formatDateTimeWib, formatStockQuantity } from "@/lib/format";
import { dashboardService } from "@/services/dashboard.service";
import type { DashboardOverviewDto } from "@/types/inventory";

export function DashboardView() {
  const [data, setData] = useState<DashboardOverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const overview = await dashboardService.getOverview(controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setData(overview);
        setError(null);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        setError(extractErrorMessage(err, "Gagal memuat ringkasan dashboard."));
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
  }, [reloadKey]);

  function handleRefresh() {
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Inventaris"
        description="Ringkasan operasional produk aktif, peringatan stok menipis, dan aktivitas stok bulan berjalan (WIB)."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {isLoading ? "Memuat..." : "Muat Ulang"}
            </button>
            <Link
              href="/stock-movements"
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Catat Pergerakan Stok
            </Link>
          </div>
        }
      />

      {error ? (
        <FeedbackBanner
          variant="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}

      {/* Summary Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Produk Aktif
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {data ? data.summary.activeProductCount : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Kategori Aktif
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {data ? data.summary.activeCategoryCount : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Stok Menipis
          </p>
          <p
            className={`mt-2 text-3xl font-semibold ${
              data && data.summary.lowStockCount > 0
                ? "text-amber-600"
                : "text-slate-900"
            }`}
          >
            {data ? data.summary.lowStockCount : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Stock In (Bulan Ini)
          </p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">
            {data ? data.summary.stockInCount : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Stock Out (Bulan Ini)
          </p>
          <p className="mt-2 text-3xl font-semibold text-sky-700">
            {data ? data.summary.stockOutCount : "—"}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Low Stock Products */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Produk Stok Menipis
              </h2>
              <p className="text-xs text-slate-500">
                Maksimal 10 produk aktif dengan defisit terbesar
              </p>
            </div>
            <Link
              href="/products"
              className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
            >
              Lihat Semua Produk
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3 text-right">Stok</th>
                  <th className="px-4 py-3 text-right">Min. Stok</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading && !data ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Memuat daftar stok menipis...
                    </td>
                  </tr>
                ) : !data || data.lowStockProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Tidak ada produk dengan stok menipis.
                    </td>
                  </tr>
                ) : (
                  data.lowStockProducts.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-amber-700">
                        {formatStockQuantity(item.currentStock, item.unit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                        {formatStockQuantity(item.minimumStock, item.unit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={`/stock-movements?productId=${item.id}&type=in`}
                          className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
                        >
                          Stock In
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Stock Movements */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pergerakan Stok Terbaru
              </h2>
              <p className="text-xs text-slate-500">
                10 transaksi terakhir (termasuk produk nonaktif)
              </p>
            </div>
            <Link
              href="/stock-movements"
              className="text-xs font-medium text-slate-700 underline hover:text-slate-900"
            >
              Riwayat Lengkap
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Waktu (WIB)</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3">Alasan & Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading && !data ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Memuat pergerakan terbaru...
                    </td>
                  </tr>
                ) : !data || data.recentStockMovements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Belum ada transaksi pergerakan stok.
                    </td>
                  </tr>
                ) : (
                  data.recentStockMovements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatDateTimeWib(mov.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {mov.product.name}
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
                        <div>
                          {formatStockQuantity(mov.quantity, mov.product.unit)}
                        </div>
                        <div className="text-xs font-normal text-slate-500">
                          {formatStockQuantity(mov.stockBefore, mov.product.unit)} →{" "}
                          {formatStockQuantity(mov.stockAfter, mov.product.unit)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{mov.reason}</div>
                        <div className="text-xs text-slate-500">
                          Oleh: {mov.createdBy.name}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
