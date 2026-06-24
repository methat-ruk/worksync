import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AuthError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>We couldn&apos;t complete that request</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
