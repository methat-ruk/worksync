import { ApiError } from "@/lib/api/api-error";

const ATTACHMENT_ERROR_MESSAGES: Record<string, string> = {
  ATTACHMENT_CONTENT_REJECTED:
    "The server rejected this file. Choose a valid PNG or JPEG.",
  ATTACHMENT_QUOTA_EXCEEDED:
    "This task or workspace has reached its attachment limit.",
  ATTACHMENT_STORAGE_UNAVAILABLE:
    "Attachment storage is temporarily unavailable. Please retry.",
  ATTACHMENT_TOO_LARGE: "The file must be 10 MiB or smaller.",
  ATTACHMENT_UPLOAD_IN_PROGRESS:
    "This upload is still being processed. Please retry shortly.",
  AUTHENTICATION_REQUIRED: "Your session has ended. Sign in and try again.",
  AUTHORIZATION_DENIED:
    "Your current workspace access does not allow this attachment action.",
  INVALID_ACCESS_TOKEN: "Your session has ended. Sign in and try again.",
  RATE_LIMITED: "Too many upload attempts. Wait a moment and retry.",
  RESOURCE_CONFLICT:
    "This attachment action conflicts with its current state. Refresh and retry.",
  RESOURCE_NOT_FOUND: "This task or attachment is no longer available.",
  SERVICE_NOT_READY:
    "Attachment protection is temporarily unavailable. Please retry.",
  VALIDATION_ERROR: "The attachment request was not accepted. Check the file."
};

export function isAttachmentAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function attachmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.data?.code;
    if (code && ATTACHMENT_ERROR_MESSAGES[code]) {
      return ATTACHMENT_ERROR_MESSAGES[code];
    }
  }
  return "Something went wrong with attachments. Please try again.";
}
