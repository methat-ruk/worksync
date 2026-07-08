"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CheckSquare2,
  FolderKanban,
  Plus,
  RefreshCw,
  Users
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import type { PublicUser } from "../auth/auth-contract";
import { createWorkspace, listWorkspaces } from "../workspaces/api-client";
import { workspaceErrorMessage } from "../workspaces/error-message";
import {
  createWorkspaceInputSchema,
  type PublicWorkspace
} from "../workspaces/workspace-contract";

type WorkspaceLoadState = "loading" | "success" | "error";

const surfaceClass =
  "rounded-2xl border border-border/80 bg-card shadow-sm shadow-slate-950/5 dark:border-primary/20 dark:shadow-black/25";
const featureBadgeClass =
  "rounded-full border border-primary/20 bg-primary/10 px-2.5 text-primary dark:bg-primary/15";
const statusBadgeClass =
  "rounded-full border border-primary/20 bg-primary/10 px-2.5 text-primary dark:bg-primary/15";
const iconTileClass =
  "grid place-items-center border border-primary/15 bg-primary/10 text-primary dark:bg-primary/15";
const createButtonClass =
  "workspace-create-button w-full gap-2 rounded-xl shadow-sm transition-all hover:-translate-y-px hover:shadow-md focus-visible:ring-primary/30 md:w-auto";

const upcomingItems = [
  {
    icon: FolderKanban,
    title: "Project foundation",
    body: "Project routes stay locked until workspace context is selected.",
    status: "Planned"
  },
  {
    icon: CheckSquare2,
    title: "Task workflow",
    body: "Tasks will arrive after project ownership and workspace scope are ready.",
    status: "Queued"
  }
];

function firstName(displayName: string): string {
  return displayName.split(" ")[0] ?? displayName;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function WorkspaceSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className={`${surfaceClass} p-6`}>
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton className="h-24 rounded-2xl" key={item} />
          ))}
        </div>
      </section>
      <Skeleton className="h-60 rounded-2xl" />
    </div>
  );
}

function WorkspaceCard({
  selected,
  workspace,
  onSelect
}: {
  selected: boolean;
  workspace: PublicWorkspace;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className="rounded-2xl border border-border/80 bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-px hover:border-primary/45 hover:bg-accent/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary/60 data-[selected=true]:bg-primary/10 dark:border-primary/15"
      data-selected={selected}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`${iconTileClass} size-10 rounded-xl`}>
          <Building2 aria-hidden="true" className="size-4" />
        </span>
        <Badge className={statusBadgeClass} variant="outline">
          {workspace.membershipRole}
        </Badge>
      </div>
      <h3 className="mt-4 truncate text-sm font-semibold">{workspace.name}</h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        /{workspace.slug}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Updated {formatDate(workspace.updatedAt)}
      </p>
    </button>
  );
}

function WorkspaceCreateForm({
  compact = false,
  onCreated
}: {
  compact?: boolean;
  onCreated: (workspace: PublicWorkspace) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = createWorkspaceInputSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the workspace name.");
      return;
    }

    setPending(true);
    try {
      const workspace = await createWorkspace(parsed.data);
      setName("");
      onCreated(workspace);
    } catch (requestError: unknown) {
      setError(workspaceErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={compact ? "grid gap-3 md:grid-cols-[1fr_auto]" : "space-y-4"}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <Field>
        <FieldLabel htmlFor={compact ? "workspace-name-compact" : "workspace-name"}>
          Workspace name
        </FieldLabel>
        <Input
          autoComplete="organization"
          disabled={pending}
          id={compact ? "workspace-name-compact" : "workspace-name"}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Product Team"
          value={name}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <div className={compact ? "flex items-end" : undefined}>
        <Button className={createButtonClass} disabled={pending} type="submit">
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          <span className="leading-none">
            {pending ? "Creating..." : "Create workspace"}
          </span>
        </Button>
      </div>
    </form>
  );
}

export function HomeDashboard({ user }: { user: PublicUser }) {
  const [loadState, setLoadState] = useState<WorkspaceLoadState>("loading");
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      workspaces[0] ??
      null,
    [selectedWorkspaceId, workspaces]
  );

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const data = await listWorkspaces();
      setWorkspaces(data.items);
      setSelectedWorkspaceId((current) =>
        current && data.items.some((workspace) => workspace.id === current)
          ? current
          : data.items[0]?.id ?? null
      );
      setLoadState("success");
    } catch (error: unknown) {
      setLoadError(workspaceErrorMessage(error));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleCreated(workspace: PublicWorkspace) {
    setWorkspaces((current) => [
      workspace,
      ...current.filter((item) => item.id !== workspace.id)
    ]);
    setSelectedWorkspaceId(workspace.id);
    setWorkspaceNotice(`${workspace.name} is ready.`);
    setLoadState("success");
    setLoadError(null);
  }

  if (loadState === "loading") {
    return <WorkspaceSkeleton />;
  }

  if (loadState === "error") {
    return (
      <div className="mx-auto max-w-3xl">
        <section className={`${surfaceClass} p-6`}>
          <Badge className={featureBadgeClass} variant="outline">
            Workspace bootstrap
          </Badge>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            We could not load your workspaces.
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The app shell stayed protected, but the workspace request did not
            finish successfully.
          </p>
          <Alert className="mt-5" variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
          <Button className="mt-5 gap-2" onClick={() => void load()} type="button">
            <RefreshCw aria-hidden="true" className="size-4" />
            Retry
          </Button>
        </section>
      </div>
    );
  }

  const hasWorkspaces = workspaces.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section
        className={`${surfaceClass} bg-[linear-gradient(135deg,color-mix(in_oklch,var(--card),var(--primary)_12%),var(--card))] p-6 md:p-7`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <Badge className={featureBadgeClass} variant="outline">
              Workspace bootstrap
            </Badge>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
              Welcome back, {firstName(user.displayName)}.
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
              WorkSync now uses your real workspace membership context instead
              of the static foundation preview.
            </p>
          </div>
          {selectedWorkspace && (
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 lg:min-w-72">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current workspace
              </p>
              <p className="mt-2 truncate text-lg font-semibold">
                {selectedWorkspace.name}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={statusBadgeClass} variant="outline">
                  {selectedWorkspace.membershipRole}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  /{selectedWorkspace.slug}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {workspaceNotice && (
        <Alert>
          <CheckCircle2 aria-hidden="true" className="size-4" />
          <AlertDescription>{workspaceNotice}</AlertDescription>
        </Alert>
      )}

      {!hasWorkspaces ? (
        <section className={`${surfaceClass} grid gap-5 p-6 lg:grid-cols-[1fr_360px]`}>
          <div>
            <div className={`${iconTileClass} size-12 rounded-2xl`}>
              <Users aria-hidden="true" className="size-5" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">
              Create your first workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              A workspace is the tenant boundary for projects, tasks, members,
              and future collaboration activity.
            </p>
          </div>
          <WorkspaceCreateForm onCreated={handleCreated} />
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className={`${surfaceClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Your workspaces</h2>
                <p className="text-sm text-muted-foreground">
                  Select a workspace context for upcoming project and task work.
                </p>
              </div>
              <Badge className={statusBadgeClass} variant="outline">
                {workspaces.length} total
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((workspace) => (
                <WorkspaceCard
                  key={workspace.id}
                  onSelect={() => setSelectedWorkspaceId(workspace.id)}
                  selected={workspace.id === selectedWorkspace?.id}
                  workspace={workspace}
                />
              ))}
            </div>
          </div>
          <aside className={`${surfaceClass} p-5`}>
            <h2 className="text-lg font-semibold">Add another workspace</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Create keeps the backend as source of truth, then selects the new
              workspace locally.
            </p>
            <div className="mt-5">
              <WorkspaceCreateForm compact onCreated={handleCreated} />
            </div>
          </aside>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {upcomingItems.map((item) => (
          <article
            className={`${surfaceClass} p-5 transition-colors hover:border-primary/35`}
            key={item.title}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`${iconTileClass} size-11 rounded-2xl`}>
                <item.icon aria-hidden="true" className="size-5" />
              </span>
              <Badge className={statusBadgeClass} variant="outline">
                {item.status}
              </Badge>
            </div>
            <h2 className="mt-5 text-base font-semibold">{item.title}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
              {item.body}
            </p>
            <Button
              className="mt-4 h-auto cursor-not-allowed items-center gap-1.5 px-0 text-muted-foreground opacity-80"
              disabled
              variant="link"
            >
              <span className="leading-none">Planned next</span>
              <ArrowRight aria-hidden="true" className="size-3.5 translate-y-px" />
            </Button>
          </article>
        ))}
      </section>
    </div>
  );
}
