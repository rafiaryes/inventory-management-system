export interface FeedbackBannerProps {
  variant: "error" | "success" | "warning";
  message: string;
  onDismiss?: () => void;
}

const VARIANT_STYLES = {
  error: "border-rose-200 bg-rose-50 text-rose-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
} as const;

export function FeedbackBanner({
  variant,
  message,
  onDismiss,
}: FeedbackBannerProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${VARIANT_STYLES[variant]}`}
    >
      <span>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-semibold underline hover:opacity-80"
        >
          Tutup
        </button>
      ) : null}
    </div>
  );
}
