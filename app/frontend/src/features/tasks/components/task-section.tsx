"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleX,
  ListTodo,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { PublicProject } from "@/features/projects/model/project-contract";
import type {
  PublicWorkspace,
  WorkspaceRole
} from "@/features/workspaces/model/workspace-contract";
import { cn } from "@/lib/utils";

import {
  createTask,
  listTasks,
  searchTaskAssignees,
  transitionTaskStatus,
  updateTask
} from "../api/tasks-api";
import {
  createTaskInputSchema,
  type PublicTask,
  type PublicTaskUser,
  type TaskAssigneeListData,
  type TaskListData,
  type TaskStatus
} from "../model/task-contract";
import { taskErrorMessage } from "../model/task-error-message";

type LoadState = "loading" | "success" | "error";
type AssigneeFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "user"; user: PublicTaskUser };

type TaskCollection = {
  items: PublicTask[];
  total: number;
  pageSize: number;
  nextPage: number;
  exhausted: boolean;
  inconsistent: boolean;
};

const initialTaskCollection: TaskCollection = {
  items: [],
  total: 0,
  pageSize: 20,
  nextPage: 1,
  exhausted: true,
  inconsistent: false
};

const statusLabels: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELED: "Canceled"
};

const statusVariants: Record<
  TaskStatus,
  "secondary" | "default" | "success" | "destructive"
> = {
  BACKLOG: "secondary",
  IN_PROGRESS: "default",
  DONE: "success",
  CANCELED: "destructive"
};

const transitionOptions: Record<
  TaskStatus,
  Array<{
    status: TaskStatus;
    label: string;
    variant: "default" | "success" | "warning" | "destructive";
    icon: typeof Play;
  }>
> = {
  BACKLOG: [
    {
      status: "IN_PROGRESS",
      label: "Start",
      variant: "default",
      icon: Play
    },
    {
      status: "CANCELED",
      label: "Cancel",
      variant: "destructive",
      icon: CircleX
    }
  ],
  IN_PROGRESS: [
    {
      status: "DONE",
      label: "Complete",
      variant: "success",
      icon: CheckCircle2
    },
    {
      status: "CANCELED",
      label: "Cancel",
      variant: "destructive",
      icon: CircleX
    }
  ],
  DONE: [
    {
      status: "IN_PROGRESS",
      label: "Reopen",
      variant: "warning",
      icon: RotateCcw
    }
  ],
  CANCELED: []
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function mergeTasks(
  current: PublicTask[],
  incoming: PublicTask[]
): PublicTask[] {
  const byId = new Map(current.map((task) => [task.id, task]));
  for (const task of incoming) {
    byId.set(task.id, task);
  }
  return [...byId.values()];
}

function taskCollectionFromPage(
  data: TaskListData,
  current: PublicTask[] = []
): TaskCollection {
  const items = mergeTasks(current, data.items);
  const total = Math.max(data.total, items.length);
  const exhausted = data.page * data.pageSize >= total;
  return {
    items,
    total,
    pageSize: data.pageSize,
    nextPage: data.page + 1,
    exhausted,
    inconsistent: exhausted && items.length < total
  };
}

function mergeAssignees(
  current: PublicTaskUser[],
  incoming: PublicTaskUser[]
): PublicTaskUser[] {
  const byId = new Map(current.map((user) => [user.id, user]));
  for (const user of incoming) {
    byId.set(user.id, user);
  }
  return [...byId.values()];
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function dateTimeLocalValue(value: Date | null): string {
  if (!value) {
    return "";
  }
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function shortId(value: string): string {
  return value.slice(-6);
}

export function AssigneePicker({
  workspaceId,
  selected,
  onSelect,
  label = "Assignee"
}: {
  workspaceId: string;
  selected: PublicTaskUser | null;
  onSelect: (user: PublicTaskUser | null) => void;
  label?: string;
}) {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const statusId = `${inputId}-status`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublicTaskUser[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [composing, setComposing] = useState(false);
  const requestIdentity = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (normalizedQuery: string, page: number, append: boolean) => {
      const identity = ++requestIdentity.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setPending(true);
      setError(null);
      try {
        const result = await searchTaskAssignees(workspaceId, {
          search: normalizedQuery,
          page,
          pageSize: 20,
          signal: controller.signal
        });
        if (
          controller.signal.aborted ||
          identity !== requestIdentity.current
        ) {
          return;
        }
        setItems((current) =>
          append ? mergeAssignees(current, result.items) : result.items
        );
        setTotal(result.total);
        setNextPage(result.page + 1);
        setActiveIndex(result.items.length > 0 && !append ? 0 : -1);
      } catch (requestError: unknown) {
        if (
          !controller.signal.aborted &&
          identity === requestIdentity.current &&
          !isAbortError(requestError)
        ) {
          setError(taskErrorMessage(requestError));
        }
      } finally {
        if (
          !controller.signal.aborted &&
          identity === requestIdentity.current
        ) {
          setPending(false);
        }
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (!open || composing) {
      return;
    }
    const normalizedQuery = query.trim();
    const timer = window.setTimeout(
      () => void runSearch(normalizedQuery, 1, false),
      normalizedQuery ? 300 : 0
    );
    return () => window.clearTimeout(timer);
  }, [composing, open, query, runSearch]);

  useEffect(
    () => () => {
      requestIdentity.current += 1;
      controllerRef.current?.abort();
    },
    []
  );

  function resetSearchResultsForQueryChange() {
    requestIdentity.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPending(false);
    setError(null);
    setItems([]);
    setTotal(0);
    setNextPage(1);
    setActiveIndex(-1);
  }

  function select(user: PublicTaskUser) {
    onSelect(user);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(items.length - 1, 0))
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const user = items[activeIndex];
      if (user) {
        select(user);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    setComposing(false);
    setQuery(event.currentTarget.value);
  }

  function handleCompositionStart() {
    setComposing(true);
    requestIdentity.current += 1;
    controllerRef.current?.abort();
    setPending(false);
  }

  const loadedAll = items.length >= total;
  const activeId =
    activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        {selected && (
          <Button
            onClick={() => onSelect(null)}
            size="xs"
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
        )}
      </div>
      {selected && (
        <Badge variant="secondary">
          {selected.displayName} · {shortId(selected.id)}
        </Badge>
      )}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
        />
        <Input
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={statusId}
          aria-expanded={open}
          autoComplete="off"
          className="pl-9"
          id={inputId}
          onChange={(event) => {
            resetSearchResultsForQueryChange();
            setQuery(event.target.value);
            setOpen(true);
          }}
          onCompositionEnd={handleCompositionEnd}
          onCompositionStart={handleCompositionStart}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search workspace members"
          role="combobox"
          value={query}
        />
      </div>
      <p aria-live="polite" className="sr-only" id={statusId}>
        {pending
          ? "Searching assignees"
          : error
            ? error
            : `${total} assignee candidates`}
      </p>
      {open && (
        <div className="rounded-xl border bg-popover p-2 shadow-sm">
          {error ? (
            <div className="space-y-2 p-2 text-sm">
              <p className="text-destructive-emphasis">{error}</p>
              <Button
                onClick={() => void runSearch(query.trim(), 1, false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry search
              </Button>
            </div>
          ) : items.length === 0 && !pending ? (
            <p className="p-2 text-sm text-muted-foreground">
              No matching workspace members.
            </p>
          ) : (
            <div
              aria-label="Assignee candidates"
              className="max-h-48 space-y-1 overflow-y-auto"
              id={listId}
              role="listbox"
            >
              {items.map((user, index) => (
                <button
                  aria-selected={selected?.id === user.id}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    index === activeIndex && "bg-muted text-foreground"
                  )}
                  id={`${listId}-option-${index}`}
                  key={user.id}
                  onClick={() => select(user)}
                  role="option"
                  type="button"
                >
                  <span>{user.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {shortId(user.id)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 px-2">
            <span className="text-xs text-muted-foreground">
              {items.length} of {total}
            </span>
            {!loadedAll && (
              <Button
                disabled={pending}
                onClick={() => void runSearch(query.trim(), nextPage, true)}
                size="sm"
                type="button"
                variant="outline"
              >
                {pending ? "Loading..." : "Load more"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskFormSheet({
  open,
  workspaceId,
  projectId,
  task,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  workspaceId: string;
  projectId: string;
  task: PublicTask | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (task: PublicTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<PublicTaskUser | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const titleId = useId();
  const titleErrorId = `${titleId}-error`;

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setDueDate(dateTimeLocalValue(task?.dueDate ?? null));
    setAssignee(task?.assignee ?? null);
    setTitleError(null);
    setRequestError(null);
  }, [open, task]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) {
      return;
    }
    const input = {
      title,
      description: description || null,
      assigneeId: assignee?.id ?? null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null
    };
    const parsed = createTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      setTitleError(parsed.error.flatten().fieldErrors.title?.[0] ?? null);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setTitleError(null);
    setRequestError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const saved = task
        ? await updateTask(
            workspaceId,
            projectId,
            task.id,
            parsed.data,
            controller.signal
          )
        : await createTask(
            workspaceId,
            projectId,
            parsed.data,
            controller.signal
          );
      onSaved(saved);
      onOpenChange(false);
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setRequestError(taskErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{task ? "Edit task" : "Create task"}</SheetTitle>
          <SheetDescription>
            {task
              ? "Update task details without changing its creator or project."
              : "Add a task to this project. New tasks start in Backlog."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col gap-5 px-4 pb-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                aria-errormessage={titleError ? titleErrorId : undefined}
                aria-invalid={Boolean(titleError)}
                disabled={pending}
                id={titleId}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
              <FieldError id={titleErrorId}>{titleError}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${titleId}-description`}>
                Description
              </FieldLabel>
              <Textarea
                disabled={pending}
                id={`${titleId}-description`}
                maxLength={5000}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                value={description}
              />
              <FieldDescription>
                Optional, up to 5,000 characters.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${titleId}-due-date`}>
                Due date
              </FieldLabel>
              <Input
                disabled={pending}
                id={`${titleId}-due-date`}
                onChange={(event) => setDueDate(event.target.value)}
                type="datetime-local"
                value={dueDate}
              />
            </Field>
            <Field>
              <AssigneePicker
                onSelect={setAssignee}
                selected={assignee}
                workspaceId={workspaceId}
              />
            </Field>
          </FieldGroup>
          {requestError && (
            <Alert variant="destructive">
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          )}
          <div className="mt-auto flex justify-end gap-2">
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "Saving..." : task ? "Save task" : "Create task"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TaskCard({
  task,
  canMutate,
  pending,
  onEdit,
  onTransition
}: {
  task: PublicTask;
  canMutate: boolean;
  pending: boolean;
  onEdit: () => void;
  onTransition: (status: TaskStatus) => void;
}) {
  return (
    <article className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-semibold">{task.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Created by {task.creator.displayName}
          </p>
        </div>
        <Badge variant={statusVariants[task.status]}>
          {statusLabels[task.status]}
        </Badge>
      </div>
      {task.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {task.description}
        </p>
      )}
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <span className="inline-flex items-center gap-1.5">
          <UserRound aria-hidden="true" className="size-3.5" />
          {task.assignee?.displayName ?? "Unassigned"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          {task.dueDate ? formatDate(task.dueDate) : "No due date"}
        </span>
      </div>
      {canMutate && (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
          <Button
            disabled={pending}
            onClick={onEdit}
            size="sm"
            type="button"
            variant="outline"
          >
            <Pencil aria-hidden="true" />
            Edit
          </Button>
          {transitionOptions[task.status].map((option) => {
            const Icon = option.icon;
            return (
              <Button
                disabled={pending}
                key={option.status}
                onClick={() => onTransition(option.status)}
                size="sm"
                type="button"
                variant={option.variant}
              >
                <Icon aria-hidden="true" />
                {option.label}
              </Button>
            );
          })}
        </div>
      )}
    </article>
  );
}

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
  const canMutate = workspace.membershipRole !== "VIEWER";

  const loadInitial = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPagePending(false);
    setLoadState("loading");
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
        setCollection(taskCollectionFromPage(data));
        setLoadState("success");
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setLoadError(taskErrorMessage(error));
        setLoadState("error");
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
        setCollection((current) =>
          taskCollectionFromPage(data, current.items)
        );
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isAbortError(error)) {
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
      if (!controller.signal.aborted && !isAbortError(error)) {
        setMutationError(taskErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setPendingTaskId(null);
      }
    }
  }

  function openCreate() {
    setEditingTask(null);
    setFormOpen(true);
  }

  function openEdit(task: PublicTask) {
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
      className="rounded-2xl border border-primary/15 bg-card p-5 shadow-sm"
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
          <Button onClick={openCreate} type="button">
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
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={`task-status-${project.id}`}
            onChange={(event) =>
              setStatusFilter(event.target.value as TaskStatus | "ALL")
            }
            value={statusFilter}
          >
            <option value="ALL">All statuses</option>
            {Object.entries(statusLabels).map(([status, label]) => (
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
              onEdit={() => openEdit(task)}
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
          onSaved={() => void loadInitial()}
          open={formOpen}
          projectId={project.id}
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
