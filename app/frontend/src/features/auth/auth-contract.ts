import { z } from "zod";

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const authDataSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive()
});

export const authResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: authDataSchema
});

export const currentUserResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ user: publicUserSchema })
});

export const messageResponseSchema = z.object({
  success: z.literal(true),
  message: z.string()
});

export const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  data: z
    .object({
      code: z.string().optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
      correlationId: z.string().optional()
    })
    .optional()
});

export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthData = z.infer<typeof authDataSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export type LoginInput = {
  email: string;
  password: string;
};

export type SignUpInput = LoginInput & {
  displayName: string;
};
