import { ApiError } from "@/lib/api/api-error";

const messages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign in again to load your projects.",
  AUTHORIZATION_DENIED: "Your workspace role cannot change projects.",
  RESOURCE_CONFLICT: "That project key is already in use.",
  RESOURCE_NOT_FOUND:
    "This workspace or project is no longer available to your account.",
  VALIDATION_ERROR: "Check the project details and try again."
};

export function projectErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.data?.code;
    return (code && messages[code]) || error.body.message;
  }
  return "Something went wrong. Please try again.";
}
