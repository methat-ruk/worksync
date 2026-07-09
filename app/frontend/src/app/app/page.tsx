"use client";

import { AppShell } from "@/features/app-shell/app-shell";
import { ProtectedRoute } from "@/features/auth/auth-guard";
import { useAuth } from "@/features/auth/auth-store";
import { WorkspaceHome } from "@/features/workspaces/components/workspace-home";

function AuthenticatedHome() {
  const { user } = useAuth();
  return (
    <AppShell>
      <WorkspaceHome user={user!} />
    </AppShell>
  );
}

export default function AppPage() {
  return (
    <ProtectedRoute>
      <AuthenticatedHome />
    </ProtectedRoute>
  );
}
