export type CommentCreatedEventV1 = Readonly<{
  type: "comment.created";
  version: 1;
  workspaceId: string;
  projectId: string;
  taskId: string;
  commentId: string;
  authorId: string;
  mentionedUserIds: readonly string[];
}>;
