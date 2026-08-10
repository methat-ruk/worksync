"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AuthRecoveryScreen({
  description = "Check your connection and try again.",
  onRetry,
  title = "We couldn't verify your session."
}: {
  description?: string;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={onRetry} type="button">
          Retry
        </Button>
      </div>
    </main>
  );
}
