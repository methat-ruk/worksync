import { ApiError } from "@/lib/api/api-error";

const COMMENT_ERROR_MESSAGES: Record<string, string> = {
  AUTHORIZATION_DENIED: "Your workspace role cannot create comments.",
  RESOURCE_CONFLICT: "The comment thread changed. Please retry.",
  RESOURCE_NOT_FOUND: "This task or workspace is no longer available.",
  VALIDATION_ERROR:
    "Check the comment and mentions. A mentioned member may no longer be available."
};

export function isCommentAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function commentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.data?.code;
    if (code && COMMENT_ERROR_MESSAGES[code]) {
      return COMMENT_ERROR_MESSAGES[code];
    }
  }
  return "Something went wrong. Please try again.";
}
