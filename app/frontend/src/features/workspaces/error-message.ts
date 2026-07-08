import { ApiError } from "../auth/api-client";

const messages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign in again to load your workspaces.",
  VALIDATION_ERROR: "Check the workspace name and try again.",
  RESOURCE_CONFLICT: "That workspace name is not available. Try another name."
};

export function workspaceErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.data?.code;
    return (code && messages[code]) || error.body.message;
  }
  return "Something went wrong. Please try again.";
}
