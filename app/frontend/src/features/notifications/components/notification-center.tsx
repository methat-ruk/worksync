"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Inbox,
  RefreshCw
} from "lucide-react";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "../api/notifications-api";
import {
  mergeNotificationPages,
  reconcileNotificationFirstPage
} from "../model/notification-cache";
import type { PublicNotification } from "../model/notification-contract";

type NotificationState = {
  phase: "loading" | "ready" | "error";
  items: PublicNotification[];
  nextCursor: string | null;
  unreadCount: number;
  refreshing: boolean;
  loadingMore: boolean;
  listError: string | null;
  actionError: string | null;
  markAllPending: boolean;
  pendingIds: ReadonlySet<string>;
};

function createInitialState(): NotificationState {
  return {
    phase: "loading",
    items: [],
    nextCursor: null,
    unreadCount: 0,
    refreshing: false,
    loadingMore: false,
    listError: null,
    actionError: null,
    markAllPending: false,
    pendingIds: new Set<string>()
  };
}

const notificationTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(action: "load" | "update"): string {
  return action === "load"
    ? "Notifications could not be loaded. Please try again."
    : "Notification state could not be updated. Please try again.";
}

function displayUnreadCount(unreadCount: number): string {
  return unreadCount > 99 ? "99+" : String(unreadCount);
}

function NotificationSkeletons() {
  return (
    <div aria-label="Loading notifications" className="flex flex-col gap-3" role="status">
      {[0, 1, 2].map((value) => (
        <div className="flex flex-col gap-2 rounded-xl border p-3" key={value}>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function NotificationRow({
  notification,
  disabled,
  pending,
  onMarkRead
}: {
  notification: PublicNotification;
  disabled: boolean;
  pending: boolean;
  onMarkRead: (notificationId: string) => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 size-2 shrink-0 rounded-full bg-primary data-[read=true]:bg-muted-foreground/30"
          data-read={notification.readAt !== null}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-5 text-foreground">
            <span className="font-semibold">
              {notification.actor.displayName}
            </span>{" "}
            mentioned you in{" "}
            <span className="font-semibold">{notification.task.title}</span>
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {notification.workspace.name} · {notification.project.key}
          </p>
          <time
            className="mt-1 block text-xs text-muted-foreground"
            dateTime={notification.createdAt.toISOString()}
          >
            {notificationTimeFormatter.format(notification.createdAt)}
          </time>
        </div>
      </div>
      {notification.readAt === null ? (
        <Button
          className="self-end"
          disabled={disabled}
          onClick={() => onMarkRead(notification.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Check data-icon="inline-start" />
          {pending ? "Marking…" : "Mark as read"}
        </Button>
      ) : null}
    </li>
  );
}

export function NotificationCenter({ sessionKey }: { sessionKey: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NotificationState>(createInitialState);
  const requestGeneration = useRef(0);
  const acceptedMutationRevision = useRef(0);
  const mutationInFlight = useRef(false);
  const firstPageController = useRef<AbortController | null>(null);
  const paginationController = useRef<AbortController | null>(null);
  const controllers = useRef(new Set<AbortController>());

  const trackController = useCallback((): AbortController => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller;
  }, []);

  const releaseController = useCallback((controller: AbortController): void => {
    controllers.current.delete(controller);
    if (firstPageController.current === controller) {
      firstPageController.current = null;
    }
    if (paginationController.current === controller) {
      paginationController.current = null;
    }
  }, []);

  const loadFirstPage = useCallback(
    async (mode: "initial" | "refresh"): Promise<void> => {
      firstPageController.current?.abort();
      paginationController.current?.abort();
      const controller = trackController();
      firstPageController.current = controller;
      const generation = ++requestGeneration.current;
      const mutationRevision = acceptedMutationRevision.current;

      setState((current) => ({
        ...current,
        phase: mode === "initial" ? "loading" : current.phase,
        refreshing: mode === "refresh",
        loadingMore: false,
        listError: null
      }));

      try {
        const data = await listNotifications({ signal: controller.signal });
        if (controller.signal.aborted || generation !== requestGeneration.current) {
          return;
        }
        const preserveAcceptedReadState =
          mutationRevision < acceptedMutationRevision.current;
        setState((current) => ({
          ...current,
          phase: "ready",
          items:
            mode === "initial"
              ? data.items
              : reconcileNotificationFirstPage(
                  current.items,
                  data.items,
                  preserveAcceptedReadState
                ),
          nextCursor: data.nextCursor,
          unreadCount: preserveAcceptedReadState
            ? current.unreadCount
            : data.unreadCount,
          refreshing: false,
          listError: null
        }));
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          generation !== requestGeneration.current ||
          isAbortError(error)
        ) {
          return;
        }
        setState((current) => ({
          ...current,
          phase: current.items.length > 0 ? "ready" : "error",
          refreshing: false,
          listError: errorMessage("load")
        }));
      } finally {
        releaseController(controller);
      }
    },
    [releaseController, trackController]
  );

  useEffect(() => {
    const activeControllers = controllers.current;
    acceptedMutationRevision.current = 0;
    mutationInFlight.current = false;
    setOpen(false);
    setState(createInitialState());
    void loadFirstPage("initial");
    return () => {
      requestGeneration.current += 1;
      for (const controller of activeControllers) {
        controller.abort();
      }
      activeControllers.clear();
    };
  }, [loadFirstPage, sessionKey]);

  async function loadMore(): Promise<void> {
    if (!state.nextCursor || state.loadingMore) {
      return;
    }
    const cursor = state.nextCursor;
    const generation = requestGeneration.current;
    const mutationRevision = acceptedMutationRevision.current;
    const controller = trackController();
    paginationController.current = controller;
    setState((current) => ({
      ...current,
      loadingMore: true,
      listError: null
    }));
    try {
      const data = await listNotifications({ cursor, signal: controller.signal });
      if (controller.signal.aborted || generation !== requestGeneration.current) {
        return;
      }
      const preserveAcceptedReadState =
        mutationRevision < acceptedMutationRevision.current;
      setState((current) => ({
        ...current,
        items: mergeNotificationPages(
          current.items,
          data.items,
          preserveAcceptedReadState
        ),
        nextCursor: data.nextCursor,
        unreadCount: preserveAcceptedReadState
          ? current.unreadCount
          : data.unreadCount,
        loadingMore: false,
        listError: null
      }));
    } catch (error: unknown) {
      if (
        controller.signal.aborted ||
        generation !== requestGeneration.current ||
        isAbortError(error)
      ) {
        return;
      }
      setState((current) => ({
        ...current,
        loadingMore: false,
        listError: errorMessage("load")
      }));
    } finally {
      releaseController(controller);
    }
  }

  async function markRead(notificationId: string): Promise<void> {
    if (mutationInFlight.current || state.pendingIds.has(notificationId)) {
      return;
    }
    const controller = trackController();
    mutationInFlight.current = true;
    setState((current) => ({
      ...current,
      actionError: null,
      pendingIds: new Set(current.pendingIds).add(notificationId)
    }));
    try {
      const data = await markNotificationRead(
        notificationId,
        controller.signal
      );
      if (controller.signal.aborted) {
        return;
      }
      acceptedMutationRevision.current += 1;
      setState((current) => ({
        ...current,
        items: current.items.map((notification) =>
          notification.id === data.notification.id
            ? data.notification
            : notification
        ),
        unreadCount: data.unreadCount,
        pendingIds: new Set(
          [...current.pendingIds].filter((id) => id !== notificationId)
        )
      }));
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setState((current) => ({
        ...current,
        actionError: errorMessage("update"),
        pendingIds: new Set(
          [...current.pendingIds].filter((id) => id !== notificationId)
        )
      }));
    } finally {
      mutationInFlight.current = false;
      releaseController(controller);
    }
  }

  async function markAllRead(): Promise<void> {
    if (
      mutationInFlight.current ||
      state.markAllPending ||
      state.unreadCount === 0
    ) {
      return;
    }
    const controller = trackController();
    mutationInFlight.current = true;
    setState((current) => ({
      ...current,
      actionError: null,
      markAllPending: true
    }));
    try {
      const data = await markAllNotificationsRead(controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      acceptedMutationRevision.current += 1;
      setState((current) => ({
        ...current,
        items: current.items.map((notification) => ({
          ...notification,
          readAt:
            notification.readAt ??
            (notification.createdAt.getTime() <= data.readAt.getTime()
              ? data.readAt
              : null)
        })),
        unreadCount: data.unreadCount,
        markAllPending: false
      }));
      void loadFirstPage("refresh");
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      setState((current) => ({
        ...current,
        actionError: errorMessage("update"),
        markAllPending: false
      }));
    } finally {
      mutationInFlight.current = false;
      releaseController(controller);
    }
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    if (
      nextOpen &&
      state.phase === "ready" &&
      !firstPageController.current
    ) {
      void loadFirstPage("refresh");
    }
  }

  const buttonLabel =
    state.unreadCount > 0
      ? `Notifications, ${state.unreadCount} unread`
      : "Notifications";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            aria-label={buttonLabel}
            className="relative mr-2"
            size="icon-lg"
            type="button"
            variant="ghost"
          />
        }
      >
        <Bell />
        {state.unreadCount > 0 ? (
          <Badge className="absolute -right-1 -top-1 min-w-5 px-1 text-[10px]">
            {displayUnreadCount(state.unreadCount)}
          </Badge>
        ) : null}
      </SheetTrigger>
      <SheetContent
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        side="right"
      >
        <SheetHeader className="border-b pr-14">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>
                Comment mentions from workspaces you can access.
              </SheetDescription>
            </div>
            <Button
              disabled={
                state.unreadCount === 0 ||
                state.markAllPending ||
                state.pendingIds.size > 0
              }
              onClick={() => void markAllRead()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <CheckCheck data-icon="inline-start" />
              {state.markAllPending ? "Marking…" : "Mark all as read"}
            </Button>
          </div>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {state.refreshing ? (
            <p className="text-xs text-muted-foreground" role="status">
              Refreshing notifications…
            </p>
          ) : null}
          {state.actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{state.actionError}</AlertDescription>
            </Alert>
          ) : null}
          {state.listError && state.items.length > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>{state.listError}</AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => void loadFirstPage("refresh")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
          {state.phase === "loading" ? <NotificationSkeletons /> : null}
          {state.phase === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>
                {state.listError ?? errorMessage("load")}
              </AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => void loadFirstPage("initial")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
          {state.phase === "ready" && state.items.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No notifications yet</EmptyTitle>
                <EmptyDescription>
                  New comment mentions will appear here.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                disabled={state.refreshing}
                onClick={() => void loadFirstPage("refresh")}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw data-icon="inline-start" />
                Refresh
              </Button>
            </Empty>
          ) : null}
          {state.items.length > 0 ? (
            <ul className="flex flex-col gap-3" aria-label="Notification list">
              {state.items.map((notification) => (
                <NotificationRow
                  disabled={state.markAllPending || state.pendingIds.size > 0}
                  key={notification.id}
                  notification={notification}
                  onMarkRead={(notificationId) => void markRead(notificationId)}
                  pending={state.pendingIds.has(notification.id)}
                />
              ))}
            </ul>
          ) : null}
          {state.nextCursor ? (
            <Button
              className="self-center"
              disabled={state.loadingMore}
              onClick={() => void loadMore()}
              type="button"
              variant="outline"
            >
              {state.loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
