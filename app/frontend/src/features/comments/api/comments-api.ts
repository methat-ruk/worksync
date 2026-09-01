import { apiRequest, parseApiError } from "@/lib/api/api-client";

import {
  commentListResponseSchema,
  commentResponseSchema,
  createCommentInputSchema,
  mentionCandidateListResponseSchema,
  type CommentListData,
  type CreateCommentInput,
  type MentionCandidate,
  type PublicComment
} from "../model/comment-contract";

function commentCollectionPath(
  workspaceId: string,
  projectId: string,
  taskId: string
): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/comments`;
}

export async function listComments(
  workspaceId: string,
  projectId: string,
  taskId: string,
  {
    cursor,
    limit = 30,
    signal
  }: { cursor?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<CommentListData> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    query.set("cursor", cursor);
  }
  const response = await apiRequest(
    `${commentCollectionPath(workspaceId, projectId, taskId)}?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return commentListResponseSchema.parse(await response.json()).data;
}

export async function createComment(
  workspaceId: string,
  projectId: string,
  taskId: string,
  input: CreateCommentInput,
  signal?: AbortSignal
): Promise<PublicComment> {
  const parsed = createCommentInputSchema.parse(input);
  const response = await apiRequest(
    commentCollectionPath(workspaceId, projectId, taskId),
    {
      method: "POST",
      body: JSON.stringify(parsed),
      ...(signal ? { signal } : {})
    },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return commentResponseSchema.parse(await response.json()).data.comment;
}

export async function searchMentionCandidates(
  workspaceId: string,
  search: string,
  signal?: AbortSignal
): Promise<MentionCandidate[]> {
  const query = new URLSearchParams({ search: search.trim(), limit: "10" });
  const response = await apiRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/mention-candidates?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return mentionCandidateListResponseSchema.parse(await response.json()).data
    .items;
}
