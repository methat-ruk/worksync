import { apiRequest, parseApiError } from "@/lib/api/api-client";
import {
  createProjectInputSchema,
  projectListResponseSchema,
  projectResponseSchema,
  type CreateProjectInput,
  type ProjectListData,
  type PublicProject
} from "../model/project-contract";

type ListProjectsInput = {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export async function listProjects(
  workspaceId: string,
  {
    page = 1,
    pageSize = 20,
    signal
  }: ListProjectsInput = {}
): Promise<ProjectListData> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  const response = await apiRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return projectListResponseSchema.parse(await response.json()).data;
}

export async function createProject(
  workspaceId: string,
  input: CreateProjectInput,
  signal?: AbortSignal
): Promise<PublicProject> {
  const parsedInput = createProjectInputSchema.parse(input);
  const response = await apiRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects`,
    {
      method: "POST",
      body: JSON.stringify(parsedInput),
      ...(signal ? { signal } : {})
    },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return projectResponseSchema.parse(await response.json()).data.project;
}
