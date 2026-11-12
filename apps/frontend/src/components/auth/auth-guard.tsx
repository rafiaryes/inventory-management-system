"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { UserRole } from "@/types/auth";

export interface RequireAuthProps {
  children: ReactNode;
  allowedRoles?: readonly UserRole[];
}

/**
 * Protects client routes by verifying active authentication and optional RBAC role requirements.
 */
export function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const target =
        pathname && pathname !== "/" && !pathname.startsWith("/login")
          ? `/login?next=${encodeURIComponent(pathname)}`
          : "/login";
      router.replace(target);
    }
  }, [status, pathname, router]);

  if (status === "loading" || status === "unauthenticated" || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600 shadow-sm">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
            aria-hidden="true"
          />
          <span>Memverifikasi sesi...</span>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700">
          403 Akses Ditolak
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Anda tidak memiliki izin membuka halaman ini
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Halaman ini hanya dapat diakses oleh pengguna dengan peran{" "}
          <span className="font-medium text-slate-900">
            {allowedRoles.join(", ")}
          </span>
          .
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
