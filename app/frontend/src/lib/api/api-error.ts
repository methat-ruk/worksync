import { z } from "zod";

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

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

export async function parseApiError(response: Response): Promise<ApiError> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  return new ApiError(
    response.status,
    parsed.success
      ? parsed.data
      : { success: false, message: "Request failed" }
  );
}
