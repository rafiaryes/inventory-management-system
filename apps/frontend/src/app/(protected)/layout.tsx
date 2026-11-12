import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
