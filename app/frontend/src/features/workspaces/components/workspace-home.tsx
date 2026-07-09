"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { listWorkspaces } from "../api/workspaces-api";
import { workspaceErrorMessage } from "../model/workspace-error-message";
import type { PublicWorkspace } from "../model/workspace-contract";
import {
  featureBadgeClass,
  statusBadgeClass,
  surfaceClass,
  UpcomingWorkItems,
  WorkspaceCard,
  WorkspaceCreateForm,
  WorkspaceEmptyState,
  WorkspaceSkeleton
} from "./workspace-home-ui";

type WorkspaceHomeUser = {
  displayName: string;
};

type WorkspaceLoadState = "loading" | "success" | "error";

function firstName(displayName: string): string {
  return displayName.split(" ")[0] ?? displayName;
}

export function WorkspaceHome({ user }: { user: WorkspaceHomeUser }) {
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
        <WorkspaceEmptyState onCreated={handleCreated} />
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

      <UpcomingWorkItems />
    </div>
  );
}
