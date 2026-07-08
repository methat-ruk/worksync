import { apiRequest, parseApiError } from "../../auth/api/auth-api";
import {
  createWorkspaceInputSchema,
  workspaceListResponseSchema,
  workspaceResponseSchema,
  type CreateWorkspaceInput,
  type PublicWorkspace,
  type WorkspaceListData
} from "../model/workspace-contract";

export async function listWorkspaces(): Promise<WorkspaceListData> {
  const response = await apiRequest(
    "/api/workspaces?page=1&pageSize=20",
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
