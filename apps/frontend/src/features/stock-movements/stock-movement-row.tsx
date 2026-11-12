import { StatusBadge } from "@/components/ui/badge";
import { formatDateTimeWib, formatStockQuantity } from "@/lib/format";
import type { StockMovementDto } from "@/types/inventory";

export interface StockMovementTableRowProps {
  movement: StockMovementDto;
  onInspect: (movement: StockMovementDto) => void;
}

/**
 * Renders one immutable stock movement history row with unit-aware quantities and inactive product indicator.
 */
export function StockMovementTableRow({
  movement,
  onInspect,
}: StockMovementTableRowProps) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
        {formatDateTimeWib(movement.createdAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">
            {movement.product.name}
          </span>
          {movement.product.status === "inactive" ? (
            <StatusBadge label="Nonaktif" tone="slate" />
          ) : null}
        </div>
        <div className="font-mono text-xs text-slate-500">
          {movement.product.sku}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <StatusBadge
          label={movement.type === "in" ? "Stock In" : "Stock Out"}
          tone={movement.type === "in" ? "green" : "blue"}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">
        {formatStockQuantity(movement.quantity, movement.product.unit)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-600">
        {formatStockQuantity(movement.stockBefore, movement.product.unit)} →{" "}
        <span className="font-semibold text-slate-900">
          {formatStockQuantity(movement.stockAfter, movement.product.unit)}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="text-slate-900">{movement.reason}</div>
        <div className="text-xs text-slate-500">
          Oleh: {movement.createdBy.name}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onInspect(movement)}
          className="text-xs font-medium text-slate-900 underline hover:text-slate-700"
        >
          Detail
        </button>
      </td>
    </tr>
  );
}
