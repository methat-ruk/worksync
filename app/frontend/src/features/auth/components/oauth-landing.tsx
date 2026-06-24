"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

import { refreshAuth } from "../auth-store";

export function OAuthLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authResult = searchParams.get("auth");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (authResult !== "google-success") {
      return;
    }
    void refreshAuth()
      .then((snapshot) => {
        if (snapshot.status === "authenticated") {
          router.replace("/app");
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, [authResult, router]);

  if (authResult === "google-success" && !failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          Finishing Google sign-in…
        </div>
      </main>
    );
  }

  const message =
    authResult === "google-cancelled"
      ? "Google sign-in was cancelled."
      : "Google sign-in could not be completed. Please try again.";

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Sign-in not completed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Link
          className={buttonVariants({ className: "w-full" })}
          href="/login"
        >
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
