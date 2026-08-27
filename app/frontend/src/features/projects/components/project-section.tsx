"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from "react";
import {
  CheckCircle2,
  FolderKanban,
  Plus,
  RefreshCw
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  PublicWorkspace,
  WorkspaceRole
} from "@/features/workspaces/model/workspace-contract";
import { TaskSection } from "@/features/tasks/components/task-section";
import {
  reconcilePageCollection,
  type ReconciledPageCollection
} from "@/lib/pagination/reconcile-page-collection";

import { createProject, listProjects } from "../api/projects-api";
import { projectErrorMessage } from "../model/project-error-message";
import {
  createProjectInputSchema,
  type PublicProject
} from "../model/project-contract";

type ProjectLoadState = "loading" | "success" | "error";

type ProjectFieldErrors = {
  name?: string;
  key?: string;
};

type ProjectCollection = ReconciledPageCollection<PublicProject> & {
  pageSize: number;
};

const initialCollection: ProjectCollection = {
  items: [],
  total: 0,
  pageSize: 20,
  nextPage: 1,
  exhausted: true,
  inconsistent: false
};

const surfaceClass =
  "rounded-2xl border border-border/80 bg-card shadow-xs shadow-slate-950/5 dark:border-primary/20 dark:shadow-black/25";

function canMutateProjects(role: WorkspaceRole): boolean {
  return role !== "VIEWER";
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function ProjectCard({
  project,
  selected,
  onSelect
}: {
  project: PublicProject;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className="rounded-2xl border border-border/80 bg-background p-4 text-left shadow-xs transition hover:border-primary/40 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/5"
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary-emphasis">
          <FolderKanban aria-hidden="true" className="size-4" />
        </span>
        <Badge variant="outline">{project.key}</Badge>
      </div>
      <h3 className="mt-4 truncate text-sm font-semibold">{project.name}</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        Updated {formatDate(project.updatedAt)}
      </p>
    </button>
  );
}

function ProjectCreateForm({
  workspaceId,
  onCreated
}: {
  workspaceId: string;
  onCreated: (project: PublicProject) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ProjectFieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const nameInputId = `project-name-${workspaceId}`;
  const nameErrorId = `${nameInputId}-error`;
  const keyInputId = `project-key-${workspaceId}`;
  const keyDescriptionId = `${keyInputId}-description`;
  const keyErrorId = `${keyInputId}-error`;

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) {
      return;
    }
    setFieldErrors({});
    setRequestError(null);

    const parsed = createProjectInputSchema.safeParse({ name, key });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      const nameError = errors.name?.[0];
      const keyError = errors.key?.[0];
      setFieldErrors({
        ...(nameError ? { name: nameError } : {}),
        ...(keyError ? { key: keyError } : {})
      });
      return;
    }

    pendingRef.current = true;
    setPending(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const project = await createProject(
        workspaceId,
        parsed.data,
        controller.signal
      );
      setName("");
      setKey("");
      onCreated(project);
    } catch (requestError: unknown) {
      if (!isAbortError(requestError)) {
        setRequestError(projectErrorMessage(requestError));
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.name)}>
          <FieldLabel htmlFor={nameInputId}>
            Project name
          </FieldLabel>
          <Input
            aria-describedby={
              fieldErrors.name ? nameErrorId : undefined
            }
            aria-errormessage={
              fieldErrors.name ? nameErrorId : undefined
            }
            aria-invalid={Boolean(fieldErrors.name)}
            autoComplete="off"
            disabled={pending}
            id={nameInputId}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="WorkSync"
            value={name}
          />
          <FieldError id={nameErrorId}>{fieldErrors.name}</FieldError>
        </Field>
        <Field data-invalid={Boolean(fieldErrors.key)}>
          <FieldLabel htmlFor={keyInputId}>
            Project key
          </FieldLabel>
          <Input
            aria-describedby={[
              keyDescriptionId,
              fieldErrors.key ? keyErrorId : null
            ]
              .filter(Boolean)
              .join(" ")}
            aria-errormessage={
              fieldErrors.key ? keyErrorId : undefined
            }
            aria-invalid={Boolean(fieldErrors.key)}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={pending}
            id={keyInputId}
            maxLength={10}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            placeholder="WSYNC"
            value={key}
          />
          <FieldDescription id={keyDescriptionId}>
            2-10 letters or numbers, starting with a letter. The key cannot be
            changed later.
          </FieldDescription>
          <FieldError id={keyErrorId}>{fieldErrors.key}</FieldError>
        </Field>
      </FieldGroup>
      {requestError && (
        <Alert variant="destructive">
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      )}
      <Button disabled={pending} type="submit">
        <Plus aria-hidden="true" data-icon="inline-start" />
        {pending ? "Creating..." : "Create project"}
      </Button>
    </form>
  );
}

export function ProjectSection({
  workspace
}: {
  workspace: PublicWorkspace;
}) {
  const [loadState, setLoadState] = useState<ProjectLoadState>("loading");
  const [collection, setCollection] =
    useState<ProjectCollection>(initialCollection);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const requestPendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadInitial = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoadState("loading");
    setLoadError(null);
    setPageError(null);
    try {
      const data = await listProjects(workspace.id, {
        signal: controller.signal
      });
      if (!controller.signal.aborted) {
        setCollection({
          ...reconcilePageCollection(
            { mode: "replace", page: data },
            (project) => project.id
          ),
          pageSize: data.pageSize
        });
        setSelectedProjectId((current) =>
          current && data.items.some((project) => project.id === current)
            ? current
            : data.items[0]?.id ?? null
        );
        setLoadState("success");
      }
    } catch (error: unknown) {
      if (
        !controller.signal.aborted &&
        !isAbortError(error)
      ) {
        setLoadError(projectErrorMessage(error));
        setLoadState("error");
      }
    }
  }, [workspace.id]);

  useEffect(() => {
    void loadInitial();
    return () => controllerRef.current?.abort();
  }, [loadInitial]);

  async function loadMore() {
    if (requestPendingRef.current || collection.exhausted) {
      return;
    }
    requestPendingRef.current = true;
    setPagePending(true);
    setPageError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const data = await listProjects(workspace.id, {
        page: collection.nextPage,
        pageSize: collection.pageSize,
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
            (project) => project.id
          ),
          pageSize: data.pageSize
        }));
      }
    } catch (error: unknown) {
      if (
        !controller.signal.aborted &&
        !isAbortError(error)
      ) {
        setPageError(projectErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        requestPendingRef.current = false;
        setPagePending(false);
      }
    }
  }

  function handleCreated(project: PublicProject) {
    setCollection((current) => {
      const exists = current.items.some((item) => item.id === project.id);
      return {
        ...current,
        items: [
          project,
          ...current.items.filter((item) => item.id !== project.id)
        ],
        total: current.total + (exists ? 0 : 1),
        exhausted: current.exhausted
      };
    });
    setNotice(`${project.name} is ready.`);
    setSelectedProjectId(project.id);
  }

  if (loadState === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label={`Projects in ${workspace.name}`}
        className={`${surfaceClass} flex flex-col gap-4 p-5`}
        id="projects"
      >
        <p className="sr-only" role="status">
          Loading projects...
        </p>
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-full max-w-md" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton className="h-32 rounded-2xl" key={item} />
          ))}
        </div>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section
        aria-label={`Projects in ${workspace.name}`}
        className={`${surfaceClass} flex flex-col gap-4 p-5`}
        id="projects"
      >
        <div>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">{workspace.name}</p>
        </div>
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button
          className="w-fit"
          onClick={() => void loadInitial()}
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
          Retry projects
        </Button>
      </section>
    );
  }

  const canCreate = canMutateProjects(workspace.membershipRole);
  const hasProjects = collection.items.length > 0;
  const selectedProject =
    collection.items.find((project) => project.id === selectedProjectId) ??
    collection.items[0] ??
    null;

  return (
    <section
      aria-label={`Projects in ${workspace.name}`}
      className={`${surfaceClass} flex flex-col gap-5 p-5`}
      id="projects"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Organize task work inside {workspace.name}.
          </p>
        </div>
        <Badge variant="outline">{collection.total} total</Badge>
      </div>

      {notice && (
        <Alert>
          <CheckCircle2 aria-hidden="true" className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div
        className={
          canCreate
            ? "grid gap-5 lg:grid-cols-[1fr_340px]"
            : "flex flex-col gap-5"
        }
      >
        <div className="flex flex-col gap-4">
          {hasProjects ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {collection.items.map((project) => (
                <ProjectCard
                  key={project.id}
                  onSelect={() => setSelectedProjectId(project.id)}
                  project={project}
                  selected={project.id === selectedProject?.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary-emphasis">
                <FolderKanban aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">
                No projects in this workspace
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {canCreate
                  ? "Create the first project to prepare a home for task work."
                  : "A workspace editor can create the first project."}
              </p>
            </div>
          )}

          {hasProjects && (
            <>
              <Separator />
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {collection.items.length} of {collection.total} loaded
                </p>
                {!collection.exhausted && !pageError && (
                  <Button
                    disabled={pagePending}
                    onClick={() => void loadMore()}
                    type="button"
                    variant="outline"
                  >
                    {pagePending ? "Loading..." : "Load more projects"}
                  </Button>
                )}
              </div>
            </>
          )}

          {pageError && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="flex flex-col items-start gap-3">
                  <p>{pageError}</p>
                  <Button
                    disabled={pagePending}
                    onClick={() => void loadMore()}
                    type="button"
                    variant="outline"
                  >
                    Retry load more
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {collection.inconsistent && !pageError && (
            <Alert>
              <AlertDescription>
                <div className="flex flex-col items-start gap-3">
                  <p>
                    The project list changed while it was loading. Refresh the
                    list to reconcile the results.
                  </p>
                  <Button
                    disabled={pagePending}
                    onClick={() => void loadInitial()}
                    type="button"
                    variant="outline"
                  >
                    Refresh projects
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {canCreate ? (
          <aside className="rounded-2xl border border-border/80 bg-background p-4">
            <h3 className="text-base font-semibold">Create a project</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The key stays stable after creation.
            </p>
            <div className="mt-4">
              <ProjectCreateForm
                onCreated={handleCreated}
                workspaceId={workspace.id}
              />
            </div>
          </aside>
        ) : (
          <Alert>
            <AlertDescription>
              Your VIEWER role is read-only. You can browse projects but cannot
              create or update them.
            </AlertDescription>
          </Alert>
        )}
      </div>
      {selectedProject && (
        <TaskSection
          key={selectedProject.id}
          project={selectedProject}
          workspace={workspace}
        />
      )}
    </section>
  );
}
