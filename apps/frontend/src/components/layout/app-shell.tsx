"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { UserRole } from "@/types/auth";

interface NavItem {
  href: string;
  label: string;
  description: string;
  roles: readonly UserRole[];
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Ringkasan stok & aktivitas",
    roles: ["admin", "staff"],
  },
  {
    href: "/products",
    label: "Produk",
    description: "Katalog barang gudang",
    roles: ["admin", "staff"],
  },
  {
    href: "/categories",
    label: "Kategori",
    description: "Pengelompokan produk",
    roles: ["admin", "staff"],
  },
  {
    href: "/stock-movements",
    label: "Pergerakan Stok",
    description: "Stock In, Stock Out & riwayat",
    roles: ["admin", "staff"],
  },
  {
    href: "/users",
    label: "Pengguna",
    description: "Manajemen akun & role",
    roles: ["admin"],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  staff: "Staff",
};

/**
 * Provides the persistent authenticated application shell with role-filtered navigation and logout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) {
    return null;
  }

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(user.role),
  );

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
            IMS
          </div>
          <div>
            <p className="text-sm font-semibold leading-none text-slate-900">
              Inventory System
            </p>
            <p className="mt-1 text-xs text-slate-500">Single Warehouse MVP</p>
          </div>
        </div>

        <nav
          aria-label="Navigasi utama"
          className="flex-1 space-y-1 px-3 py-4"
        >
          {visibleNavItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2.5 transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div
                  className={`text-xs ${
                    active ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {item.description}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-slate-900">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <span className="mt-2 inline-flex items-center rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-40 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
        >
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <span className="text-sm font-semibold text-slate-900">
                Inventory System
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {visibleNavItems.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              Menu
            </button>
            <div className="lg:hidden">
              <span className="text-sm font-semibold text-slate-900">IMS</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">
                Role: {ROLE_LABELS[user.role]}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingOut ? "Keluar..." : "Keluar"}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
