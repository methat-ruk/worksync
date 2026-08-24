"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleX,
  Pencil,
  Play,
  RotateCcw,
  UserRound
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { PublicTask, TaskStatus } from "../model/task-contract";

export const taskStatusLabels: Record<TaskStatus, string> = {
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

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

export function TaskCard({
  task,
  canMutate,
  pending,
  onEdit,
  onTransition
}: {
  task: PublicTask;
  canMutate: boolean;
  pending: boolean;
  onEdit: (trigger: HTMLButtonElement) => void;
  onTransition: (status: TaskStatus) => void;
}) {
  return (
    <article className="rounded-2xl border bg-background p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate font-semibold">{task.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Created by {task.creator.displayName}
          </p>
        </div>
        <Badge variant={statusVariants[task.status]}>
          {taskStatusLabels[task.status]}
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
            onClick={(event) => onEdit(event.currentTarget)}
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
