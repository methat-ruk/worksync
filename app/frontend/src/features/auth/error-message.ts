import { ApiError } from "./api-client";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Invalid email or password.",
  AUTH_EMAIL_CONFLICT: "An account with this email already exists.",
  AUTH_PASSWORD_POLICY_VIOLATION:
    "Choose a stronger password that meets every requirement."
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.data?.code;
    return (code && messages[code]) || error.body.message;
  }
  return "Something went wrong. Please try again.";
}
