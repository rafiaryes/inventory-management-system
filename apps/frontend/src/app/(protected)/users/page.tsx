import { RequireAuth } from "@/components/auth/auth-guard";
import { UsersView } from "@/features/users/users-view";

export default function UsersPage() {
  return (
    <RequireAuth allowedRoles={["admin"]}>
      <UsersView />
    </RequireAuth>
  );
}
