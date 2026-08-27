"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListTodo, Plus, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicProject } from "@/features/projects/model/project-contract";
import type { PublicWorkspace } from "@/features/workspaces/model/workspace-contract";
import {
  reconcilePageCollection,
  type ReconciledPageCollection
} from "@/lib/pagination/reconcile-page-collection";

import {
  listTasks,
  transitionTaskStatus
} from "../api/tasks-api";
import type {
  PublicTask,
  PublicTaskUser,
  TaskStatus
} from "../model/task-contract";
import {
  isTaskAbortError,
  taskErrorMessage
} from "../model/task-error-message";
import { AssigneePicker } from "./assignee-picker";
import { TaskCard, taskStatusLabels } from "./task-card";
import { TaskFormSheet } from "./task-form-sheet";

type LoadState = "loading" | "success" | "error";
type AssigneeFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "user"; user: PublicTaskUser };

type TaskCollection = ReconciledPageCollection<PublicTask> & {
  pageSize: number;
};

const initialTaskCollection: TaskCollection = {
  items: [],
  total: 0,
  pageSize: 20,
  nextPage: 1,
  exhausted: true,
  inconsistent: false
};

export function TaskSection({
  workspace,
  project
}: {
  workspace: PublicWorkspace;
  project: PublicProject;
}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [collection, setCollection] =
    useState<TaskCollection>(initialTaskCollection);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>({
    kind: "all"
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PublicTask | null>(null);
  const [cancelTask, setCancelTask] = useState<PublicTask | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const formReturnFocusRef = useRef<HTMLElement | null>(null);
  const createTaskButtonRef = useRef<HTMLButtonElement | null>(null);
  const canMutate = workspace.membershipRole !== "VIEWER";

  const loadInitial = useCallback(async ({
    preserveContent = false
  }: { preserveContent?: boolean } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPagePending(false);
    if (!preserveContent) {
      setLoadState("loading");
    }
    setLoadError(null);
    setPageError(null);
    try {
      const data = await listTasks(workspace.id, project.id, {
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        ...(assigneeFilter.kind === "user"
          ? { assigneeId: assigneeFilter.user.id }
          : {}),
        ...(assigneeFilter.kind === "unassigned"
          ? { unassigned: true }
          : {}),
        signal: controller.signal
      });
      if (!controller.signal.aborted) {
        setCollection({
          ...reconcilePageCollection(
            { mode: "replace", page: data },
            (task) => task.id
          ),
          pageSize: data.pageSize
        });
        setLoadState("success");
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isTaskAbortError(error)) {
        if (preserveContent) {
          setMutationError(
            `Task saved, but the task list could not be refreshed. ${taskErrorMessage(error)}`
          );
        } else {
          setLoadError(taskErrorMessage(error));
          setLoadState("error");
        }
      }
    }
  }, [assigneeFilter, project.id, statusFilter, workspace.id]);

  useEffect(() => {
    void loadInitial();
    return () => controllerRef.current?.abort();
  }, [loadInitial]);

  useEffect(
    () => () => {
      mutationControllerRef.current?.abort();
    },
    []
  );

  async function loadMore() {
    if (pagePending || collection.exhausted) {
      return;
    }
    setPagePending(true);
    setPageError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const data = await listTasks(workspace.id, project.id, {
        page: collection.nextPage,
        pageSize: collection.pageSize,
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        ...(assigneeFilter.kind === "user"
          ? { assigneeId: assigneeFilter.user.id }
          : {}),
        ...(assigneeFilter.kind === "unassigned"
          ? { unassigned: true }
          : {}),
        signal: controller.signal
      });
      if (!controller.signal.aborted) {
        setCollection((current) => ({
          ...reconcilePageCollection(
            {
              mode: "append",
              currentItems: current.items,
              page: data
            },
            (task) => task.id
          ),
          pageSize: data.pageSize
        }));
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isTaskAbortError(error)) {
        setPageError(taskErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setPagePending(false);
      }
    }
  }

  async function transition(task: PublicTask, status: TaskStatus) {
    if (pendingTaskId) {
      return;
    }
    if (status === "CANCELED") {
      setCancelTask(task);
      return;
    }
    await commitTransition(task, status);
  }

  async function commitTransition(task: PublicTask, status: TaskStatus) {
    if (pendingTaskId) {
      return;
    }
    setPendingTaskId(task.id);
    setMutationError(null);
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    try {
      await transitionTaskStatus(
        workspace.id,
        project.id,
        task.id,
        status,
        controller.signal
      );
      await loadInitial();
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isTaskAbortError(error)) {
        setMutationError(taskErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setPendingTaskId(null);
      }
    }
  }

  function openCreate(trigger: HTMLButtonElement) {
    formReturnFocusRef.current = trigger;
    setEditingTask(null);
    setFormOpen(true);
  }

  function openEdit(task: PublicTask, trigger: HTMLButtonElement) {
    formReturnFocusRef.current = trigger;
    setEditingTask(task);
    setFormOpen(true);
  }

  if (loadState === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label={`Tasks in ${project.name}`}
        className="rounded-2xl border bg-card p-5"
      >
        <p className="sr-only" role="status">
          Loading tasks...
        </p>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-3 h-24 w-full rounded-2xl" />
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section
        aria-label={`Tasks in ${project.name}`}
        className="rounded-2xl border bg-card p-5"
      >
        <h3 className="text-lg font-semibold">Tasks</h3>
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button
          className="mt-4"
          onClick={() => void loadInitial()}
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" />
          Retry tasks
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label={`Tasks in ${project.name}`}
      className="rounded-2xl border border-primary/15 bg-card p-5 shadow-xs"
      id="tasks"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo
              aria-hidden="true"
              className="size-5 text-primary-emphasis"
            />
            <h3 className="text-lg font-semibold">Tasks in {project.name}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {collection.total} matching task{collection.total === 1 ? "" : "s"}
          </p>
        </div>
        {canMutate && (
          <Button
            onClick={(event) => openCreate(event.currentTarget)}
            ref={createTaskButtonRef}
            type="button"
          >
            <Plus aria-hidden="true" />
            Create task
          </Button>
        )}
      </div>

      {!canMutate && (
        <Alert className="mt-4">
          <AlertDescription>
            Your VIEWER role is read-only. You can browse and filter tasks but
            cannot change them.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-5 grid gap-4 rounded-2xl border bg-background/60 p-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`task-status-${project.id}`}>
            Status filter
          </FieldLabel>
          <select
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            id={`task-status-${project.id}`}
            onChange={(event) =>
              setStatusFilter(event.target.value as TaskStatus | "ALL")
            }
            value={statusFilter}
          >
            <option value="ALL">All statuses</option>
            {Object.entries(taskStatusLabels).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <AssigneePicker
            label="Assignee filter"
            onSelect={(user) =>
              setAssigneeFilter(user ? { kind: "user", user } : { kind: "all" })
            }
            selected={
              assigneeFilter.kind === "user" ? assigneeFilter.user : null
            }
            workspaceId={workspace.id}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => setAssigneeFilter({ kind: "all" })}
              size="sm"
              type="button"
              variant={
                assigneeFilter.kind === "all" ? "secondary" : "outline"
              }
            >
              All
            </Button>
            <Button
              onClick={() => setAssigneeFilter({ kind: "unassigned" })}
              size="sm"
              type="button"
              variant={
                assigneeFilter.kind === "unassigned"
                  ? "secondary"
                  : "outline"
              }
            >
              Unassigned
            </Button>
          </div>
        </Field>
      </div>

      {mutationError && (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}

      {collection.items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed p-6 text-center">
          <ListTodo
            aria-hidden="true"
            className="mx-auto size-8 text-muted-foreground"
          />
          <h4 className="mt-3 font-semibold">No matching tasks</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {canMutate
              ? "Create a task or change the current filters."
              : "Change the filters to look for other tasks."}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {collection.items.map((task) => (
            <TaskCard
              canMutate={canMutate}
              key={task.id}
              onEdit={(trigger) => openEdit(task, trigger)}
              onTransition={(status) => void transition(task, status)}
              pending={pendingTaskId === task.id}
              task={task}
            />
          ))}
        </div>
      )}

      {pageError && (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>
            <div className="flex items-center justify-between gap-3">
              <span>{pageError}</span>
              <Button
                disabled={pagePending}
                onClick={() => void loadMore()}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {collection.inconsistent && !pageError && (
        <Alert className="mt-4">
          <AlertDescription>
            <div className="flex flex-col items-start gap-3">
              <p>
                The task list changed while it was loading. Refresh the list
                to reconcile the results.
              </p>
              <Button
                disabled={pagePending}
                onClick={() => void loadInitial()}
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Refresh tasks
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {!collection.exhausted && !pageError && (
        <div className="mt-5 flex justify-center">
          <Button
            disabled={pagePending}
            onClick={() => void loadMore()}
            type="button"
            variant="outline"
          >
            {pagePending ? "Loading..." : "Load more tasks"}
          </Button>
        </div>
      )}

      {canMutate && (
        <TaskFormSheet
          onOpenChange={setFormOpen}
          onSaved={() => {
            setMutationError(null);
            void loadInitial({ preserveContent: true });
          }}
          open={formOpen}
          projectId={project.id}
          returnFocusRef={formReturnFocusRef}
          successFocusRef={createTaskButtonRef}
          task={editingTask}
          workspaceId={workspace.id}
        />
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !pendingTaskId) {
            setCancelTask(null);
          }
        }}
        open={Boolean(cancelTask)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTask?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This task cannot be reopened after it is canceled. Its history
              remains available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(pendingTaskId)}>
              Keep task
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(pendingTaskId)}
              onClick={(event) => {
                event.preventDefault();
                if (cancelTask) {
                  void commitTransition(cancelTask, "CANCELED").then(() =>
                    setCancelTask(null)
                  );
                }
              }}
              variant="destructive"
            >
              {pendingTaskId ? "Canceling..." : "Cancel task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
