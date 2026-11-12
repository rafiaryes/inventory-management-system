import Link from "next/link";
import { FeedbackBanner } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import {
  formatCurrencyIdr,
  formatDateTimeWib,
  formatStockQuantity,
  isDecimalLessThanOrEqual,
} from "@/lib/format";
import { isAdminProductDto, type ProductDto } from "@/types/inventory";

export interface ProductDetailModalContentProps {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  product: ProductDto | null;
  onRetry: () => void;
}

/**
 * Renders the Product Detail modal body across loading, error, Admin (with prices), and Staff (price-free) states.
 */
export function ProductDetailModalContent({
  isAdmin,
  loading,
  error,
  product,
  onRetry,
}: ProductDetailModalContentProps) {
  if (loading) {
    return (
      <div className="py-6 text-center text-sm text-slate-500">
        Memuat detail produk...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <FeedbackBanner variant="error" message={error} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <div className="space-y-4">
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">SKU</dt>
          <dd className="font-mono font-medium text-slate-900">
            {product.sku}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Nama Produk</dt>
          <dd className="text-right font-medium text-slate-900">
            {product.name}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Kategori</dt>
          <dd className="text-right font-medium text-slate-900">
            {product.category.name}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Status</dt>
          <dd>
            <StatusBadge
              label={product.status === "active" ? "Aktif" : "Nonaktif"}
              tone={product.status === "active" ? "green" : "slate"}
            />
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Satuan Unit</dt>
          <dd className="font-medium text-slate-900">{product.unit}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Stok Saat Ini</dt>
          <dd className="flex items-center gap-2 font-semibold text-slate-900">
            {product.status === "active" &&
            isDecimalLessThanOrEqual(
              product.currentStock,
              product.minimumStock,
            ) ? (
              <StatusBadge label="Menipis" tone="amber" />
            ) : null}
            <span>
              {formatStockQuantity(product.currentStock, product.unit)}
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Stok Minimum</dt>
          <dd className="font-medium text-slate-900">
            {formatStockQuantity(product.minimumStock, product.unit)}
          </dd>
        </div>
        {isAdmin && isAdminProductDto(product) ? (
          <>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Harga Beli</dt>
              <dd className="font-medium text-slate-900">
                {formatCurrencyIdr(product.purchasePrice)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Harga Jual</dt>
              <dd className="font-semibold text-slate-900">
                {formatCurrencyIdr(product.sellingPrice)}
              </dd>
            </div>
          </>
        ) : null}
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Dibuat (WIB)</dt>
          <dd className="text-right text-xs text-slate-700">
            {formatDateTimeWib(product.createdAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Diperbarui (WIB)</dt>
          <dd className="text-right text-xs text-slate-700">
            {formatDateTimeWib(product.updatedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Deskripsi Lengkap</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-slate-800">
            {product.description?.trim()
              ? product.description
              : "Tidak ada deskripsi produk."}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        <Link
          href={`/stock-movements?productId=${product.id}&view=history`}
          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Lihat Riwayat Stok
        </Link>
        {product.status === "active" ? (
          <Link
            href={`/stock-movements?productId=${product.id}`}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Catat Stok
          </Link>
        ) : null}
      </div>
    </div>
  );
}
