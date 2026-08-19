"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AuthRecoveryScreen({
  message = "We couldn't load this page.",
  onRetry
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={onRetry} type="button">
          Retry
        </Button>
      </div>
    </main>
  );
}
