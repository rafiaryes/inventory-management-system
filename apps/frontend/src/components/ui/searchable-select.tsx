"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { extractErrorMessage } from "@/lib/errors";
import {
  filterLocalOptions,
  mergeUniqueOptions,
  REFERENCE_PAGE_SIZE,
  type ReferenceSelectOption,
} from "@/lib/reference-helpers";
import type { PaginationMeta } from "@/types/api";

export interface SearchableSelectFetchResult<T> {
  options: ReferenceSelectOption<T>[];
  meta: PaginationMeta;
}

export interface SearchableSelectProps<T> {
  id: string;
  value: string;
  onChange: (
    nextValue: string,
    selectedOption: ReferenceSelectOption<T> | null,
  ) => void;
  fetchPage: (params: {
    page: number;
    pageSize: number;
    search: string;
    signal: AbortSignal;
  }) => Promise<SearchableSelectFetchResult<T>>;
  selectedOption?: ReferenceSelectOption<T> | null;
  extraOptions?: readonly ReferenceSelectOption<T>[];
  placeholder: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  emptyMessage?: string;
  pageSize?: number;
  debounceMs?: number;
  refreshKey?: number;
  required?: boolean;
}

const EMPTY_META: PaginationMeta = {
  page: 1,
  pageSize: REFERENCE_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export interface SearchableSelectDropdownListProps<T> {
  id: string;
  value: string;
  searchInput: string;
  searchPlaceholder: string;
  allowClear: boolean;
  clearLabel: string;
  emptyMessage: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadError: string | null;
  visibleOptions: readonly ReferenceSelectOption<T>[];
  loadedCount: number;
  meta: PaginationMeta;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (nextSearch: string) => void;
  onSelect: (id: string, option: ReferenceSelectOption<T> | null) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}

/**
 * Pure presentational listbox panel rendered by SearchableSelect when open.
 */
export function SearchableSelectDropdownList<T>({
  id,
  value,
  searchInput,
  searchPlaceholder,
  allowClear,
  clearLabel,
  emptyMessage,
  isLoading,
  isLoadingMore,
  loadError,
  visibleOptions,
  loadedCount,
  meta,
  searchInputRef,
  onSearchChange,
  onSelect,
  onRetry,
  onLoadMore,
}: SearchableSelectDropdownListProps<T>) {
  const hasMore = meta.page < meta.totalPages;

  return (
    <div
      role="listbox"
      aria-labelledby={id}
      className="absolute z-40 mt-1 w-full min-w-[240px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
    >
      <input
        ref={searchInputRef}
        type="text"
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="mb-2 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
      />

      <div className="max-h-60 overflow-y-auto">
        {allowClear ? (
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => onSelect("", null)}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-100 ${
              value === ""
                ? "bg-slate-100 font-medium text-slate-900"
                : "text-slate-700"
            }`}
          >
            <span>{clearLabel}</span>
          </button>
        ) : null}

        {isLoading ? (
          <div className="px-2.5 py-3 text-center text-xs text-slate-500">
            Memuat daftar pilihan...
          </div>
        ) : loadError ? (
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold underline hover:text-rose-950"
            >
              Coba Lagi
            </button>
          </div>
        ) : visibleOptions.length === 0 ? (
          <div className="px-2.5 py-3 text-center text-xs text-slate-500">
            {emptyMessage}
          </div>
        ) : (
          visibleOptions.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(option.id, option)}
                className={`mt-0.5 flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-100 ${
                  isSelected
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-700"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{option.label}</div>
                  {option.description ? (
                    <div className="truncate text-xs text-slate-500">
                      {option.description}
                    </div>
                  ) : null}
                </div>
                {option.badgeLabel ? (
                  <StatusBadge
                    label={option.badgeLabel}
                    tone={option.badgeTone ?? "slate"}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {hasMore ? (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {isLoadingMore
              ? "Memuat halaman berikutnya..."
              : `Muat lebih banyak (${loadedCount} dari ${meta.totalItems})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Reusable server-side searchable and paginated dropdown selector.
 */
export function SearchableSelect<T>({
  id,
  value,
  onChange,
  fetchPage,
  selectedOption = null,
  extraOptions = [],
  placeholder,
  searchPlaceholder = "Cari...",
  allowClear = false,
  clearLabel = "Semua",
  disabled = false,
  emptyMessage = "Tidak ada data yang cocok.",
  pageSize = REFERENCE_PAGE_SIZE,
  debounceMs = 300,
  refreshKey = 0,
  required = false,
}: SearchableSelectProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const fetchPageRef = useRef(fetchPage);

  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [options, setOptions] = useState<ReferenceSelectOption<T>[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>(EMPTY_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Debounce search query so rapid typing does not spam API requests
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [debounceMs, searchInput]);

  // Fetch page 1 whenever debouncedSearch, refreshKey, or retryToken changes
  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;

    const controller = new AbortController();

    async function loadFirstPage() {
      await Promise.resolve();
      if (controller.signal.aborted) {
        return;
      }
      setIsLoadingMore(false);
      setIsLoading(true);
      setLoadError(null);

      try {
        const res = await fetchPageRef.current({
          page: 1,
          pageSize,
          search: debouncedSearch,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setOptions(res.options);
        setMeta(res.meta);
        setLoadError(null);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        setLoadError(extractErrorMessage(err, "Gagal memuat daftar pilihan."));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadFirstPage();
    return () => {
      controller.abort();
    };
  }, [debouncedSearch, pageSize, refreshKey, retryToken]);

  const handleLoadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || meta.page >= meta.totalPages) {
      return;
    }

    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const nextPage = meta.page + 1;
      const res = await fetchPageRef.current({
        page: nextPage,
        pageSize,
        search: debouncedSearch,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      setOptions((prev) => mergeUniqueOptions(prev, res.options));
      setMeta(res.meta);
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        return;
      }
      setLoadError(extractErrorMessage(err, "Gagal memuat halaman berikutnya."));
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingMore(false);
      }
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
      }
    }
  }, [debouncedSearch, isLoading, isLoadingMore, meta.page, meta.totalPages, pageSize]);

  // Close on outside click
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleMouseDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    // Use capture phase so Escape closes the dropdown without dismissing parent ModalDialog
    function handleKeyDownCapture(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDownCapture, true);
    };
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus();
    }
  }, [open]);

  const filteredExtras = useMemo(
    () => filterLocalOptions(extraOptions, debouncedSearch),
    [debouncedSearch, extraOptions],
  );

  const visibleOptions = useMemo(
    () => mergeUniqueOptions(options, filteredExtras),
    [filteredExtras, options],
  );

  const resolvedSelected = useMemo(() => {
    if (!value) {
      return null;
    }
    if (selectedOption && selectedOption.id === value) {
      return selectedOption;
    }
    return (
      visibleOptions.find((opt) => opt.id === value) ??
      extraOptions.find((opt) => opt.id === value) ??
      options.find((opt) => opt.id === value) ??
      null
    );
  }, [extraOptions, options, selectedOption, value, visibleOptions]);

  const triggerText = value
    ? (resolvedSelected?.label ?? `Terpilih (${value.slice(0, 8)}...)`)
    : allowClear
      ? clearLabel
      : placeholder;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-required={required || undefined}
        onClick={() => setOpen((prev) => !prev)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none transition hover:border-slate-400 focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`truncate ${!value && !allowClear ? "text-slate-400" : ""}`}
          >
            {triggerText}
          </span>
          {value && resolvedSelected?.badgeLabel ? (
            <StatusBadge
              label={resolvedSelected.badgeLabel}
              tone={resolvedSelected.badgeTone ?? "slate"}
            />
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {loadError && !open ? (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-rose-700">
          <span className="truncate">{loadError}</span>
          <button
            type="button"
            onClick={() => setRetryToken((k) => k + 1)}
            className="shrink-0 font-semibold underline hover:text-rose-900"
          >
            Coba Lagi
          </button>
        </div>
      ) : null}

      {open ? (
        <SearchableSelectDropdownList
          id={id}
          value={value}
          searchInput={searchInput}
          searchPlaceholder={searchPlaceholder}
          allowClear={allowClear}
          clearLabel={clearLabel}
          emptyMessage={emptyMessage}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          loadError={loadError}
          visibleOptions={visibleOptions}
          loadedCount={options.length}
          meta={meta}
          searchInputRef={searchInputRef}
          onSearchChange={setSearchInput}
          onSelect={(nextId, option) => {
            onChange(nextId, option);
            setOpen(false);
          }}
          onRetry={() => setRetryToken((k) => k + 1)}
          onLoadMore={() => void handleLoadMore()}
        />
      ) : null}
    </div>
  );
}
