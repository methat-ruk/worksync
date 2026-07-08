import { z } from "zod";

export const workspaceRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER"
]);

export const publicWorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  membershipRole: workspaceRoleSchema
});

export const workspaceListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicWorkspaceSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().min(0)
  })
});

export const workspaceResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    workspace: publicWorkspaceSchema
  })
});

export const createWorkspaceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required.")
    .max(100, "Workspace name must be 100 characters or fewer.")
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type PublicWorkspace = z.infer<typeof publicWorkspaceSchema>;
export type WorkspaceListData = z.infer<typeof workspaceListResponseSchema>["data"];
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
