"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";

import { bootstrapAuth, useAuth } from "./auth-store";
import { AuthRecoveryScreen } from "./components/auth-recovery-screen";

function AuthLoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40">
      <div className="flex w-full max-w-sm flex-col gap-3 px-6">
        <p className="sr-only" role="status">
          Checking your session…
        </p>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    </main>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (auth.status === "loading") {
      void bootstrapAuth();
    }
  }, [auth.status]);

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [auth.status, pathname, router]);

  if (auth.status === "recoverable-error") {
    return <AuthRecoveryScreen onRetry={() => void bootstrapAuth()} />;
  }
  if (auth.status !== "authenticated") {
    return <AuthLoadingScreen />;
  }
  return children;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "loading") {
      void bootstrapAuth();
    }
  }, [auth.status]);

  useEffect(() => {
    if (auth.status === "authenticated") {
      router.replace("/app");
    }
  }, [auth.status, router]);

  if (auth.status === "recoverable-error") {
    return <AuthRecoveryScreen onRetry={() => void bootstrapAuth()} />;
  }
  if (auth.status !== "unauthenticated") {
    return <AuthLoadingScreen />;
  }
  return children;
}
