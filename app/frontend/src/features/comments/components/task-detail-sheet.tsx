"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import {
  CalendarDays,
  MessageSquareText,
  RefreshCw,
  UserRound
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicTask } from "@/features/tasks/model/task-contract";
import { taskStatusLabels } from "@/features/tasks/components/task-card";

import { listComments } from "../api/comments-api";
import type {
  PublicComment,
  PublicCommentMention
} from "../model/comment-contract";
import {
  commentErrorMessage,
  isCommentAbortError
} from "../model/comment-error-message";
import { MentionCommentComposer } from "./mention-comment-composer";

type LoadState = "idle" | "loading" | "success" | "error";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function renderCommentBody(
  body: string,
  mentions: readonly PublicCommentMention[]
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, mention] of [...mentions]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .entries()) {
    if (
      mention.start < cursor ||
      mention.end <= mention.start ||
      mention.end > body.length
    ) {
      continue;
    }
    nodes.push(body.slice(cursor, mention.start));
    nodes.push(
      <span
        className="rounded bg-primary/10 px-0.5 font-medium text-primary-emphasis"
        key={`${mention.start}-${mention.end}-${index}`}
      >
        {body.slice(mention.start, mention.end)}
      </span>
    );
    cursor = mention.end;
  }
  nodes.push(body.slice(cursor));
  return nodes;
}

function CommentItem({ comment }: { comment: PublicComment }) {
  return (
    <article className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{comment.author.displayName}</p>
        <time
          className="text-xs text-muted-foreground"
          dateTime={comment.createdAt.toISOString()}
        >
          {formatDate(comment.createdAt)}
        </time>
      </div>
      <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-6">
        {renderCommentBody(comment.body, comment.mentions)}
      </p>
    </article>
  );
}

export function TaskDetailSheet({
  open,
  workspaceId,
  projectId,
  task,
  canCreateComment,
  returnFocusRef,
  onOpenChange
}: {
  open: boolean;
  workspaceId: string;
  projectId: string;
  task: PublicTask | null;
  canCreateComment: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [olderPending, setOlderPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadInitial = useCallback(async () => {
    if (!task) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoadState("loading");
    setOlderPending(false);
    setLoadError(null);
    setOlderError(null);
    try {
      const data = await listComments(workspaceId, projectId, task.id, {
        signal: controller.signal
      });
      if (!controller.signal.aborted) {
        setComments(data.items);
        setNextCursor(data.nextCursor);
        setLoadState("success");
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isCommentAbortError(error)) {
        setLoadError(commentErrorMessage(error));
        setLoadState("error");
      }
    }
  }, [projectId, task, workspaceId]);

  useEffect(() => {
    if (open && task) {
      void loadInitial();
    }
    return () => controllerRef.current?.abort();
  }, [loadInitial, open, task]);

  async function loadOlder() {
    if (!task || !nextCursor || olderPending) {
      return;
    }
    setOlderPending(true);
    setOlderError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const data = await listComments(workspaceId, projectId, task.id, {
        cursor: nextCursor,
        signal: controller.signal
      });
      if (!controller.signal.aborted) {
        setComments((current) => {
          const currentIds = new Set(current.map(({ id }) => id));
          return [
            ...data.items.filter(({ id }) => !currentIds.has(id)),
            ...current
          ];
        });
        setNextCursor(data.nextCursor);
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isCommentAbortError(error)) {
        setOlderError(commentErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        setOlderPending(false);
      }
    }
  }

  function appendCreated(comment: PublicComment) {
    setComments((current) =>
      current.some(({ id }) => id === comment.id)
        ? current
        : [...current, comment]
    );
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-2xl"
        finalFocus={() => returnFocusRef.current}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{task?.title ?? "Task details"}</SheetTitle>
          <SheetDescription>
            Review task context and its plain-text comment thread.
          </SheetDescription>
        </SheetHeader>
        {task && (
          <div className="flex flex-col gap-5 px-4 pb-6">
            <section aria-label="Task context" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {taskStatusLabels[task.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Created {formatDate(task.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-muted-foreground">
                {task.description || "No description provided."}
              </p>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <span className="inline-flex items-center gap-2">
                  <UserRound
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {task.assignee?.displayName ?? "Unassigned"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarDays
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {task.dueDate ? formatDate(task.dueDate) : "No due date"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Created by {task.creator.displayName}
              </p>
            </section>

            <Separator />

            <section aria-labelledby={`comments-${task.id}`}>
              <div className="flex items-center gap-2">
                <MessageSquareText
                  aria-hidden="true"
                  className="size-5 text-primary-emphasis"
                />
                <h3 className="font-semibold" id={`comments-${task.id}`}>
                  Comments
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reopen or refresh this task to see comments posted by others.
              </p>

              {loadState === "loading" && (
                <div aria-busy="true" className="mt-4 space-y-3">
                  <p className="sr-only" role="status">
                    Loading comments...
                  </p>
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              )}
              {loadState === "error" && (
                <div className="mt-4">
                  <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                  </Alert>
                  <Button
                    className="mt-3"
                    onClick={() => void loadInitial()}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCw aria-hidden="true" />
                    Retry comments
                  </Button>
                </div>
              )}
              {loadState === "success" && (
                <>
                  {nextCursor && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        disabled={olderPending}
                        onClick={() => void loadOlder()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {olderPending ? "Loading..." : "Load older comments"}
                      </Button>
                    </div>
                  )}
                  {olderError && (
                    <Alert className="mt-3" variant="destructive">
                      <AlertDescription>
                        <div className="flex items-center justify-between gap-3">
                          <span>{olderError}</span>
                          <Button
                            disabled={olderPending}
                            onClick={() => void loadOlder()}
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
                  {comments.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed p-5 text-center">
                      <p className="font-medium">No comments yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {canCreateComment
                          ? "Start the discussion below."
                          : "There is no discussion on this task yet."}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {comments.map((comment) => (
                        <CommentItem comment={comment} key={comment.id} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {loadState === "success" && (
              <>
                <Separator />
                {canCreateComment ? (
                  <MentionCommentComposer
                    onCreated={appendCreated}
                    projectId={projectId}
                    taskId={task.id}
                    workspaceId={workspaceId}
                  />
                ) : (
                  <Alert>
                    <AlertDescription>
                      Your VIEWER role can read this thread but cannot post
                      comments.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
