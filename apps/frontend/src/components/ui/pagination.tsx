import type { PaginationMeta } from "@/types/api";

export interface PaginationControlsProps {
  meta: PaginationMeta;
  isLoading?: boolean;
  onPageChange: (nextPage: number) => void;
}

export function PaginationControls({
  meta,
  isLoading = false,
  onPageChange,
}: PaginationControlsProps) {
  const totalPages = Math.max(meta.totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Menampilkan halaman{" "}
        <span className="font-medium text-slate-900">{meta.page}</span> dari{" "}
        <span className="font-medium text-slate-900">{totalPages}</span> (total{" "}
        <span className="font-medium text-slate-900">{meta.totalItems}</span>{" "}
        data)
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isLoading || meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          disabled={isLoading || meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
