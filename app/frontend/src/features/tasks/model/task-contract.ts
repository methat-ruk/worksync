import { z } from "zod";

export const taskStatusSchema = z.enum([
  "BACKLOG",
  "IN_PROGRESS",
  "DONE",
  "CANCELED"
]);

export const publicTaskUserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1)
});

export const publicTaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable(),
  status: taskStatusSchema,
  dueDate: z.coerce.date().nullable(),
  creator: publicTaskUserSchema,
  assignee: publicTaskUserSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const taskResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({ task: publicTaskSchema })
});

export const taskListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicTaskSchema),
    page: z.number().int().min(1).max(10_000),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().min(0)
  })
});

export const taskAssigneeListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(publicTaskUserSchema),
    page: z.number().int().min(1).max(10_000),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().min(0)
  })
});

export const createTaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Task title is required.")
    .max(200, "Task title must be 200 characters or fewer."),
  description: z
    .string()
    .max(5000, "Description must be 5,000 characters or fewer.")
    .nullable()
    .optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional()
});

export const updateTaskInputSchema = createTaskInputSchema.partial();

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type PublicTaskUser = z.infer<typeof publicTaskUserSchema>;
export type PublicTask = z.infer<typeof publicTaskSchema>;
export type TaskListData = z.infer<typeof taskListResponseSchema>["data"];
export type TaskAssigneeListData = z.infer<
  typeof taskAssigneeListResponseSchema
>["data"];
export type CreateTaskInput = z.input<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;
