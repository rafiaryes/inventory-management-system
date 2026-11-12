import { Suspense } from "react";
import { StockMovementsView } from "@/features/stock-movements/stock-movements-view";

export default function StockMovementsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Memuat halaman pergerakan stok...
        </div>
      }
    >
      <StockMovementsView />
    </Suspense>
  );
}
