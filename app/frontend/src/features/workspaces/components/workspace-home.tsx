"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { listWorkspaces } from "../api/workspaces-api";
import { workspaceErrorMessage } from "../model/workspace-error-message";
import type {
  PublicWorkspace,
  WorkspaceListData
} from "../model/workspace-contract";
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

type WorkspacePageRequestKind = "load-more" | "refresh";

type WorkspacePageRequestState =
  | { status: "idle"; kind: null; error: null }
  | { status: "loading"; kind: WorkspacePageRequestKind; error: null }
  | { status: "error"; kind: WorkspacePageRequestKind; error: string };

type WorkspaceCollectionState = {
  items: PublicWorkspace[];
  total: number;
  pageSize: number;
  nextPage: number;
  exhausted: boolean;
  inconsistent: boolean;
  selectedWorkspaceId: string | null;
};

type WorkspaceCollectionAction =
  | { type: "initial-loaded"; data: WorkspaceListData }
  | { type: "page-loaded"; data: WorkspaceListData }
  | { type: "workspace-created"; workspace: PublicWorkspace }
  | { type: "workspace-selected"; workspaceId: string };

const initialCollectionState: WorkspaceCollectionState = {
  items: [],
  total: 0,
  pageSize: 20,
  nextPage: 1,
  exhausted: true,
  inconsistent: false,
  selectedWorkspaceId: null
};

const initialPageRequestState: WorkspacePageRequestState = {
  status: "idle",
  kind: null,
  error: null
};

function mergeUniqueWorkspaces(
  current: PublicWorkspace[],
  incoming: PublicWorkspace[]
): PublicWorkspace[] {
  const merged = [...current];
  const indexById = new Map(
    current.map((workspace, index) => [workspace.id, index])
  );

  for (const workspace of incoming) {
    const existingIndex = indexById.get(workspace.id);
    if (existingIndex === undefined) {
      indexById.set(workspace.id, merged.length);
      merged.push(workspace);
    } else {
      merged[existingIndex] = workspace;
    }
  }

  return merged;
}

function workspaceCollectionReducer(
  state: WorkspaceCollectionState,
  action: WorkspaceCollectionAction
): WorkspaceCollectionState {
  if (action.type === "workspace-selected") {
    return { ...state, selectedWorkspaceId: action.workspaceId };
  }

  if (action.type === "workspace-created") {
    const exists = state.items.some(
      (workspace) => workspace.id === action.workspace.id
    );
    const items = [
      action.workspace,
      ...state.items.filter((workspace) => workspace.id !== action.workspace.id)
    ];
    const total = Math.max(state.total + (exists ? 0 : 1), items.length);

    return {
      ...state,
      items,
      total,
      inconsistent: state.exhausted && items.length < total,
      selectedWorkspaceId: action.workspace.id
    };
  }

  const replacing = action.type === "initial-loaded";
  const items = mergeUniqueWorkspaces(
    replacing ? [] : state.items,
    action.data.items
  );
  const total = replacing
    ? Math.max(action.data.total, items.length)
    : Math.max(state.total, action.data.total, items.length);
  const exhausted = action.data.page * action.data.pageSize >= total;
  const selectedWorkspaceId =
    state.selectedWorkspaceId &&
    items.some((workspace) => workspace.id === state.selectedWorkspaceId)
      ? state.selectedWorkspaceId
      : items[0]?.id ?? null;

  return {
    items,
    total,
    pageSize: action.data.pageSize,
    nextPage: action.data.page + 1,
    exhausted,
    inconsistent: exhausted && items.length < total,
    selectedWorkspaceId
  };
}

function firstName(displayName: string): string {
  return displayName.split(" ")[0] ?? displayName;
}

export function WorkspaceHome({ user }: { user: WorkspaceHomeUser }) {
  const [loadState, setLoadState] = useState<WorkspaceLoadState>("loading");
  const [collection, dispatchCollection] = useReducer(
    workspaceCollectionReducer,
    initialCollectionState
  );
  const [pageRequest, setPageRequest] = useState<WorkspacePageRequestState>(
    initialPageRequestState
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const pageRequestPending = useRef(false);

  const selectedWorkspace = useMemo(
    () =>
      collection.items.find(
        (workspace) => workspace.id === collection.selectedWorkspaceId
      ) ??
      collection.items[0] ??
      null,
    [collection.items, collection.selectedWorkspaceId]
  );

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const data = await listWorkspaces();
      dispatchCollection({ type: "initial-loaded", data });
      setLoadState("success");
    } catch (error: unknown) {
      setLoadError(workspaceErrorMessage(error));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestPage(kind: WorkspacePageRequestKind) {
    if (pageRequestPending.current) {
      return;
    }

    const page = kind === "refresh" ? 1 : collection.nextPage;
    pageRequestPending.current = true;
    setPageRequest({ status: "loading", kind, error: null });

    try {
      const data = await listWorkspaces({
        page,
        pageSize: collection.pageSize
      });
      dispatchCollection({
        type: kind === "refresh" ? "initial-loaded" : "page-loaded",
        data
      });
      setPageRequest(initialPageRequestState);
    } catch (error: unknown) {
      setPageRequest({
        status: "error",
        kind,
        error: workspaceErrorMessage(error)
      });
    } finally {
      pageRequestPending.current = false;
    }
  }

  function handleCreated(workspace: PublicWorkspace) {
    dispatchCollection({ type: "workspace-created", workspace });
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

  const hasWorkspaces = collection.items.length > 0;
  const pageRequestLabel =
    pageRequest.kind === "refresh" ? "Retry refresh" : "Retry load more";

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
                {collection.total} total
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {collection.items.map((workspace) => (
                <WorkspaceCard
                  key={workspace.id}
                  onSelect={() =>
                    dispatchCollection({
                      type: "workspace-selected",
                      workspaceId: workspace.id
                    })
                  }
                  selected={workspace.id === selectedWorkspace?.id}
                  workspace={workspace}
                />
              ))}
            </div>
            <Separator className="mt-5" />
            <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                className="text-sm text-muted-foreground"
              >
                {collection.items.length} of {collection.total} loaded
              </p>
              {!collection.exhausted && pageRequest.status !== "error" && (
                <Button
                  disabled={pageRequest.status === "loading"}
                  onClick={() => void requestPage("load-more")}
                  type="button"
                  variant="outline"
                >
                  {pageRequest.status === "loading" &&
                  pageRequest.kind === "load-more"
                    ? "Loading..."
                    : "Load more"}
                </Button>
              )}
            </div>
            {pageRequest.status === "error" && (
              <Alert className="mt-4" variant="destructive">
                <AlertDescription>
                  <div className="flex flex-col items-start gap-3">
                    <p>{pageRequest.error}</p>
                    <Button
                      onClick={() => void requestPage(pageRequest.kind)}
                      type="button"
                      variant="outline"
                    >
                      {pageRequestLabel}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {collection.inconsistent && pageRequest.status !== "error" && (
              <Alert className="mt-4">
                <AlertDescription>
                  <div className="flex flex-col items-start gap-3">
                    <p>
                      The workspace list changed while it was loading. Refresh
                      the list to reconcile the results.
                    </p>
                    <Button
                      disabled={pageRequest.status === "loading"}
                      onClick={() => void requestPage("refresh")}
                      type="button"
                      variant="outline"
                    >
                      {pageRequest.status === "loading" &&
                      pageRequest.kind === "refresh"
                        ? "Refreshing..."
                        : "Refresh workspaces"}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
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
