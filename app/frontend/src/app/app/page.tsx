"use client";

import { AppShell } from "@/features/app-shell/app-shell";
import { HomeDashboard } from "@/features/app-shell/home-dashboard";
import { ProtectedRoute } from "@/features/auth/auth-guard";
import { useAuth } from "@/features/auth/auth-store";

function AuthenticatedHome() {
  const { user } = useAuth();
  return (
    <AppShell>
      <HomeDashboard user={user!} />
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
