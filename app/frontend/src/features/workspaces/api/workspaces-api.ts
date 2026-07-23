import { apiRequest, parseApiError } from "@/lib/api/api-client";
import {
  createWorkspaceInputSchema,
  workspaceListResponseSchema,
  workspaceResponseSchema,
  type CreateWorkspaceInput,
  type PublicWorkspace,
  type WorkspaceListData
} from "../model/workspace-contract";

type ListWorkspacesInput = {
  page?: number;
  pageSize?: number;
};

export async function listWorkspaces({
  page = 1,
  pageSize = 20
}: ListWorkspacesInput = {}): Promise<WorkspaceListData> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  const response = await apiRequest(
    `/api/workspaces?${query.toString()}`,
    {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return workspaceListResponseSchema.parse(await response.json()).data;
}

export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<PublicWorkspace> {
  const parsedInput = createWorkspaceInputSchema.parse(input);
  const response = await apiRequest(
    "/api/workspaces",
    {
      method: "POST",
      body: JSON.stringify(parsedInput)
    },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return workspaceResponseSchema.parse(await response.json()).data.workspace;
}
