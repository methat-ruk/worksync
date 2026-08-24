"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CompositionEvent,
  type KeyboardEvent
} from "react";
import { RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { searchTaskAssignees } from "../api/tasks-api";
import type {
  PublicTaskUser,
  TaskAssigneeListData
} from "../model/task-contract";
import {
  isTaskAbortError,
  taskErrorMessage
} from "../model/task-error-message";

type AssigneeCandidateCollection = {
  items: PublicTaskUser[];
  total: number;
  nextPage: number;
  exhausted: boolean;
  inconsistent: boolean;
};

const initialAssigneeCandidateCollection: AssigneeCandidateCollection = {
  items: [],
  total: 0,
  nextPage: 1,
  exhausted: true,
  inconsistent: false
};

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

function assigneeCandidateCollectionFromPage(
  data: TaskAssigneeListData,
  current: PublicTaskUser[] = []
): AssigneeCandidateCollection {
  const items = mergeAssignees(current, data.items);
  const total = Math.max(data.total, items.length);
  const exhausted = data.page * data.pageSize >= total;
  return {
    items,
    total,
    nextPage: data.page + 1,
    exhausted,
    inconsistent: exhausted && items.length < total
  };
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
  const [candidates, setCandidates] =
    useState<AssigneeCandidateCollection>(initialAssigneeCandidateCollection);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [composing, setComposing] = useState(false);
  const compositeRef = useRef<HTMLDivElement>(null);
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
        setCandidates((current) =>
          assigneeCandidateCollectionFromPage(
            result,
            append ? current.items : []
          )
        );
        setActiveIndex(result.items.length > 0 && !append ? 0 : -1);
      } catch (requestError: unknown) {
        if (
          !controller.signal.aborted &&
          identity === requestIdentity.current &&
          !isTaskAbortError(requestError)
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
    setCandidates(initialAssigneeCandidateCollection);
    setActiveIndex(-1);
  }

  function select(user: PublicTaskUser) {
    onSelect(user);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(candidates.items.length - 1, 0))
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const user = candidates.items[activeIndex];
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

  const activeId =
    open && activeIndex >= 0 && candidates.items[activeIndex]
      ? `${listId}-option-${activeIndex}`
      : undefined;

  return (
    <div
      className="flex flex-col gap-2"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          !(nextTarget instanceof Node) ||
          !compositeRef.current?.contains(nextTarget)
        ) {
          setOpen(false);
        }
      }}
      ref={compositeRef}
    >
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
          aria-controls={open ? listId : undefined}
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
            : `${candidates.total} assignee candidates`}
      </p>
      {open && (
        <div className="rounded-xl border bg-popover p-2 shadow-xs">
          {error && (
            <div className="flex flex-col gap-2 p-2 text-sm">
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
          )}
          <div
            aria-busy={pending || undefined}
            aria-label="Assignee candidates"
            className="flex max-h-48 flex-col gap-1 overflow-y-auto"
            id={listId}
            role="listbox"
          >
            {candidates.items.map((user, index) => (
              <button
                aria-selected={selected?.id === user.id}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  index === activeIndex && "bg-muted text-foreground"
                )}
                id={`${listId}-option-${index}`}
                key={user.id}
                onClick={() => select(user)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span>{user.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {shortId(user.id)}
                </span>
              </button>
            ))}
          </div>
          {pending && candidates.items.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Searching...</p>
          )}
          {!pending && !error && candidates.items.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No matching workspace members.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 px-2">
            <span className="text-xs text-muted-foreground">
              {candidates.items.length} of {candidates.total}
            </span>
            {!candidates.exhausted && (
              <Button
                disabled={pending}
                onClick={() =>
                  void runSearch(query.trim(), candidates.nextPage, true)
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {pending ? "Loading..." : "Load more"}
              </Button>
            )}
          </div>
          {candidates.inconsistent && !error && !pending && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border p-2 text-sm">
              <p className="text-muted-foreground">
                The assignee list changed while it was loading. Refresh the
                candidates to reconcile the results.
              </p>
              <Button
                onClick={() => void runSearch(query.trim(), 1, false)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Refresh candidates
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
