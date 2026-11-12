"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    } else if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600 shadow-sm">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
          aria-hidden="true"
        />
        <span>Memuat aplikasi Inventory Management System...</span>
      </div>
    </main>
  );
}
