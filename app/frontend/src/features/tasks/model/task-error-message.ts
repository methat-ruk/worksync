import { ApiError } from "@/lib/api/api-error";

const TASK_ERROR_MESSAGES: Record<string, string> = {
  AUTHORIZATION_DENIED: "Your workspace role cannot change tasks.",
  INVALID_TASK_TRANSITION:
    "That task changed or the requested status is no longer allowed. Refresh and try again.",
  RESOURCE_CONFLICT:
    "The task changed at the same time. Please retry your action.",
  RESOURCE_NOT_FOUND:
    "The task, project, or assignee is no longer available.",
  VALIDATION_ERROR: "Check the task details and try again."
};

export function taskErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.body.data?.code;
    if (code && TASK_ERROR_MESSAGES[code]) {
      return TASK_ERROR_MESSAGES[code];
    }
  }
  return "Something went wrong. Please try again.";
}
