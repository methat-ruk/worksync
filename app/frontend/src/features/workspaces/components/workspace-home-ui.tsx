"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  MessageSquare,
  Plus,
  Users
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { createWorkspace } from "../api/workspaces-api";
import { workspaceErrorMessage } from "../model/workspace-error-message";
import {
  createWorkspaceInputSchema,
  type PublicWorkspace
} from "../model/workspace-contract";

export const surfaceClass =
  "rounded-2xl border border-border/80 bg-card shadow-xs shadow-slate-950/5 dark:border-primary/20 dark:shadow-black/25";
export const featureBadgeClass =
  "rounded-full border border-primary/20 bg-primary/10 px-2.5 text-primary-emphasis dark:bg-primary/15";
export const statusBadgeClass =
  "rounded-full border border-primary/20 bg-primary/10 px-2.5 text-primary-emphasis dark:bg-primary/15";

const iconTileClass =
  "grid place-items-center border border-primary/15 bg-primary/10 text-primary-emphasis dark:bg-primary/15";
const createButtonClass =
  "w-full gap-2 rounded-xl shadow-xs transition-all hover:-translate-y-px hover:shadow-md focus-visible:ring-primary/30 md:w-auto";

const upcomingItems = [
  {
    icon: MessageSquare,
    title: "Comments and mentions",
    body: "Task discussions and teammate mentions are the next collaboration slice.",
    status: "Next"
  }
];

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

export function WorkspaceSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
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

export function WorkspaceCard({
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
      className="rounded-2xl border border-border/80 bg-card p-4 text-left shadow-xs transition-all hover:-translate-y-px hover:border-primary/45 hover:bg-accent/70 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary/60 data-[selected=true]:bg-primary/10 dark:border-primary/15"
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

export function WorkspaceCreateForm({
  compact = false,
  disabled = false,
  onPendingChange,
  onCreated
}: {
  compact?: boolean;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
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
    onPendingChange?.(true);
    try {
      const workspace = await createWorkspace(parsed.data);
      setName("");
      onCreated(workspace);
    } catch (requestError: unknown) {
      setError(workspaceErrorMessage(requestError));
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  const unavailable = disabled || pending;

  return (
    <form
      className={
        compact
          ? "grid gap-3 md:grid-cols-[1fr_auto]"
          : "flex flex-col gap-4"
      }
      onSubmit={(event) => void handleSubmit(event)}
    >
      <Field>
        <FieldLabel htmlFor={compact ? "workspace-name-compact" : "workspace-name"}>
          Workspace name
        </FieldLabel>
        <Input
          autoComplete="organization"
          disabled={unavailable}
          id={compact ? "workspace-name-compact" : "workspace-name"}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Product Team"
          value={name}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <div className={compact ? "flex items-end" : undefined}>
        <Button
          className={createButtonClass}
          disabled={unavailable}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          <span className="leading-none">
            {pending ? "Creating..." : "Create workspace"}
          </span>
        </Button>
      </div>
    </form>
  );
}

export function WorkspaceEmptyState({
  onCreated
}: {
  onCreated: (workspace: PublicWorkspace) => void;
}) {
  return (
    <section className={`${surfaceClass} grid gap-5 p-6 lg:grid-cols-[1fr_360px]`}>
      <div>
        <div className={`${iconTileClass} size-12 rounded-2xl`}>
          <Users aria-hidden="true" className="size-5" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">
          Create your first workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          A workspace is the tenant boundary for projects, tasks, members, and
          future collaboration activity.
        </p>
      </div>
      <WorkspaceCreateForm onCreated={onCreated} />
    </section>
  );
}

export function UpcomingWorkItems() {
  return (
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
  );
}
