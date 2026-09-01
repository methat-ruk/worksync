import { z } from "zod";

export const MAX_COMMENT_LENGTH = 4_000;

export const publicCommentMentionSchema = z.object({
  start: z.number().int().min(0).max(MAX_COMMENT_LENGTH),
  end: z.number().int().min(1).max(MAX_COMMENT_LENGTH)
});

export const publicCommentSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  body: z.string().min(1).max(MAX_COMMENT_LENGTH),
  author: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1)
  }),
  mentions: z.array(publicCommentMentionSchema).max(20),
  createdAt: z.coerce.date()
});

export const commentListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicCommentSchema),
    nextCursor: z.string().min(1).nullable()
  })
});

export const commentResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({ comment: publicCommentSchema })
});

export const mentionCandidateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  mentionLabel: z.string().min(1)
});

export const mentionCandidateListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ items: z.array(mentionCandidateSchema).max(10) })
});

export const commentMentionInputSchema = z.object({
  userId: z.string().min(1).max(100),
  start: z.number().int().min(0).max(MAX_COMMENT_LENGTH),
  end: z.number().int().min(1).max(MAX_COMMENT_LENGTH)
});

export const createCommentInputSchema = z.object({
  body: z.string().min(1).max(MAX_COMMENT_LENGTH),
  mentions: z.array(commentMentionInputSchema).max(20)
});

export type PublicComment = z.infer<typeof publicCommentSchema>;
export type PublicCommentMention = z.infer<
  typeof publicCommentMentionSchema
>;
export type MentionCandidate = z.infer<typeof mentionCandidateSchema>;
export type CommentMentionInput = z.infer<typeof commentMentionInputSchema>;
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
export type CommentListData = z.infer<typeof commentListResponseSchema>["data"];
