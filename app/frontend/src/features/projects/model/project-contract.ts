import { z } from "zod";

export const publicProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const projectListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicProjectSchema),
    page: z.number().int().min(1).max(10_000),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().min(0)
  })
});

export const projectResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    project: publicProjectSchema
  })
});

const normalizedProjectKeySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(2, "Project key must be at least 2 characters.")
      .max(10, "Project key must be 10 characters or fewer.")
      .regex(
        /^[A-Z][A-Z0-9]{1,9}$/,
        "Project key must start with a letter and use only letters and numbers."
      )
  );

export const createProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(100, "Project name must be 100 characters or fewer."),
  key: normalizedProjectKeySchema
});

export type PublicProject = z.infer<typeof publicProjectSchema>;
export type ProjectListData = z.infer<typeof projectListResponseSchema>["data"];
export type CreateProjectInput = z.input<typeof createProjectInputSchema>;
export type NormalizedCreateProjectInput = z.output<
  typeof createProjectInputSchema
>;
