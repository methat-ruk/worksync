import { apiRequest, parseApiError } from "@/lib/api/api-client";

import {
  createTaskInputSchema,
  taskAssigneeListResponseSchema,
  taskListResponseSchema,
  taskResponseSchema,
  updateTaskInputSchema,
  type CreateTaskInput,
  type PublicTask,
  type TaskAssigneeListData,
  type TaskListData,
  type TaskStatus,
  type UpdateTaskInput
} from "../model/task-contract";

function taskCollectionPath(workspaceId: string, projectId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tasks`;
}

export type ListTasksInput = {
  page?: number;
  pageSize?: number;
  status?: TaskStatus;
  assigneeId?: string;
  unassigned?: boolean;
  signal?: AbortSignal;
};

export async function listTasks(
  workspaceId: string,
  projectId: string,
  {
    page = 1,
    pageSize = 20,
    status,
    assigneeId,
    unassigned,
    signal
  }: ListTasksInput = {}
): Promise<TaskListData> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  if (status) {
    query.set("status", status);
  }
  if (assigneeId) {
    query.set("assigneeId", assigneeId);
  }
  if (unassigned) {
    query.set("unassigned", "true");
  }
  const response = await apiRequest(
    `${taskCollectionPath(workspaceId, projectId)}?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return taskListResponseSchema.parse(await response.json()).data;
}

export async function createTask(
  workspaceId: string,
  projectId: string,
  input: CreateTaskInput,
  signal?: AbortSignal
): Promise<PublicTask> {
  const parsed = createTaskInputSchema.parse(input);
  const response = await apiRequest(
    taskCollectionPath(workspaceId, projectId),
    {
      method: "POST",
      body: JSON.stringify(parsed),
      ...(signal ? { signal } : {})
    },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return taskResponseSchema.parse(await response.json()).data.task;
}

export async function updateTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
  signal?: AbortSignal
): Promise<PublicTask> {
  const parsed = updateTaskInputSchema.parse(input);
  const response = await apiRequest(
    `${taskCollectionPath(workspaceId, projectId)}/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(parsed),
      ...(signal ? { signal } : {})
    },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return taskResponseSchema.parse(await response.json()).data.task;
}

export async function transitionTaskStatus(
  workspaceId: string,
  projectId: string,
  taskId: string,
  status: TaskStatus,
  signal?: AbortSignal
): Promise<PublicTask> {
  const response = await apiRequest(
    `${taskCollectionPath(workspaceId, projectId)}/${encodeURIComponent(taskId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
      ...(signal ? { signal } : {})
    },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return taskResponseSchema.parse(await response.json()).data.task;
}

export async function searchTaskAssignees(
  workspaceId: string,
  {
    search = "",
    page = 1,
    pageSize = 20,
    signal
  }: {
    search?: string;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  } = {}
): Promise<TaskAssigneeListData> {
  const query = new URLSearchParams({
    search: search.trim(),
    page: String(page),
    pageSize: String(pageSize)
  });
  const response = await apiRequest(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/task-assignees?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return taskAssigneeListResponseSchema.parse(await response.json()).data;
}
