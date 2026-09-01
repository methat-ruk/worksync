"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { AtSign, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  createComment,
  searchMentionCandidates
} from "../api/comments-api";
import {
  canonicalizeCommentDraft,
  findActiveMentionQuery,
  hasDisallowedCommentControl,
  reconcileMentionsAfterEdit,
  type ActiveMentionQuery
} from "../model/comment-draft";
import {
  MAX_COMMENT_LENGTH,
  type CommentMentionInput,
  type MentionCandidate,
  type PublicComment
} from "../model/comment-contract";
import {
  commentErrorMessage,
  isCommentAbortError
} from "../model/comment-error-message";

function shortId(value: string): string {
  return value.slice(-6);
}

export function MentionCommentComposer({
  workspaceId,
  projectId,
  taskId,
  onCreated
}: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  onCreated: (comment: PublicComment) => void;
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<CommentMentionInput[]>([]);
  const [activeQuery, setActiveQuery] = useState<ActiveMentionQuery | null>(
    null
  );
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [composing, setComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const compositeRef = useRef<HTMLDivElement>(null);
  const submitControllerRef = useRef<AbortController | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchIdentityRef = useRef(0);
  const pendingRef = useRef(false);
  const blurTimerRef = useRef<number | null>(null);
  const inputId = useId();
  const listId = `${inputId}-mention-list`;
  const statusId = `${inputId}-mention-status`;
  const errorId = `${inputId}-error`;

  useEffect(() => {
    if (!activeQuery || composing) {
      searchIdentityRef.current += 1;
      searchControllerRef.current?.abort();
      setCandidates([]);
      setSearchPending(false);
      setSearchError(null);
      return;
    }
    const identity = ++searchIdentityRef.current;
    const timer = window.setTimeout(async () => {
      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;
      setSearchPending(true);
      setSearchError(null);
      try {
        const result = await searchMentionCandidates(
          workspaceId,
          activeQuery.query,
          controller.signal
        );
        if (!controller.signal.aborted && identity === searchIdentityRef.current) {
          setCandidates(result);
          setActiveIndex(0);
        }
      } catch (error: unknown) {
        if (
          !controller.signal.aborted &&
          identity === searchIdentityRef.current &&
          !isCommentAbortError(error)
        ) {
          setCandidates([]);
          setSearchError(commentErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted && identity === searchIdentityRef.current) {
          setSearchPending(false);
        }
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeQuery, composing, workspaceId]);

  useEffect(
    () => () => {
      searchIdentityRef.current += 1;
      searchControllerRef.current?.abort();
      submitControllerRef.current?.abort();
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    },
    []
  );

  function refreshActiveQuery(
    nextBody: string,
    caret: number,
    nextMentions: readonly CommentMentionInput[] = mentions
  ) {
    if (!composing) {
      const query = findActiveMentionQuery(nextBody, caret);
      setActiveQuery(
        query &&
          nextMentions.some(
            (mention) => mention.start === query.start
          )
          ? null
          : query
      );
    }
  }

  function handleBodyChange(nextBody: string, caret: number) {
    const nextMentions = reconcileMentionsAfterEdit(body, nextBody, mentions);
    setMentions(nextMentions);
    setBody(nextBody);
    setValidationError(null);
    refreshActiveQuery(nextBody, caret, nextMentions);
  }

  function selectCandidate(candidate: MentionCandidate) {
    if (!activeQuery) {
      return;
    }
    const before = body.slice(0, activeQuery.start);
    const after = body.slice(activeQuery.end);
    const mentionText = `@${candidate.mentionLabel}`;
    const spacing =
      after.length === 0
        ? " "
        : /^[\s.,!?;:\])}>]/u.test(after)
          ? ""
          : " ";
    const nextBody = `${before}${mentionText}${spacing}${after}`;
    const retained = reconcileMentionsAfterEdit(body, nextBody, mentions);
    const nextMention = {
      userId: candidate.id,
      start: activeQuery.start,
      end: activeQuery.start + mentionText.length
    };
    const nextCaret = nextMention.end + spacing.length;
    setBody(nextBody);
    setMentions(
      [...retained, nextMention].sort(
        (left, right) => left.start - right.start || left.end - right.end
      )
    );
    setActiveQuery(null);
    setCandidates([]);
    setSearchError(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!activeQuery) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setActiveQuery(null);
      setCandidates([]);
      return;
    }
    if (event.key === "ArrowDown" && candidates.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % candidates.length);
      return;
    }
    if (event.key === "ArrowUp" && candidates.length > 0) {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + candidates.length) % candidates.length
      );
      return;
    }
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      candidates[activeIndex]
    ) {
      event.preventDefault();
      selectCandidate(candidates[activeIndex]);
    }
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>) {
    setComposing(false);
    setActiveQuery(
      findActiveMentionQuery(
        event.currentTarget.value,
        event.currentTarget.selectionStart
      )
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) {
      return;
    }
    const canonical = canonicalizeCommentDraft(body, mentions);
    if (!canonical.body) {
      setValidationError("Write a comment before posting.");
      return;
    }
    if (canonical.body.length > MAX_COMMENT_LENGTH) {
      setValidationError("Comments must be 4,000 characters or fewer.");
      return;
    }
    if (hasDisallowedCommentControl(canonical.body)) {
      setValidationError("Comments contain an unsupported control character.");
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setValidationError(null);
    setRequestError(null);
    const controller = new AbortController();
    submitControllerRef.current = controller;
    try {
      const comment = await createComment(
        workspaceId,
        projectId,
        taskId,
        canonical,
        controller.signal
      );
      setBody("");
      setMentions([]);
      setActiveQuery(null);
      setCandidates([]);
      onCreated(comment);
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isCommentAbortError(error)) {
        setRequestError(commentErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  const menuOpen = Boolean(activeQuery);
  const activeOptionId = candidates[activeIndex]
    ? `${listId}-option-${activeIndex}`
    : undefined;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <Field data-invalid={Boolean(validationError)}>
        <FieldLabel htmlFor={inputId}>Add a comment</FieldLabel>
        <div
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (
              !(nextTarget instanceof Node) ||
              !compositeRef.current?.contains(nextTarget)
            ) {
              if (blurTimerRef.current !== null) {
                window.clearTimeout(blurTimerRef.current);
              }
              blurTimerRef.current = window.setTimeout(() => {
                if (
                  !compositeRef.current?.contains(document.activeElement)
                ) {
                  setActiveQuery(null);
                  setCandidates([]);
                }
                blurTimerRef.current = null;
              }, 0);
            }
          }}
          ref={compositeRef}
        >
          <Textarea
            aria-activedescendant={menuOpen ? activeOptionId : undefined}
            aria-autocomplete="list"
            aria-controls={menuOpen ? listId : undefined}
            aria-describedby={`${statusId}${validationError ? ` ${errorId}` : ""}`}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-invalid={Boolean(validationError)}
            disabled={pending}
            id={inputId}
            maxLength={MAX_COMMENT_LENGTH}
            onChange={(event) =>
              handleBodyChange(
                event.currentTarget.value,
                event.currentTarget.selectionStart
              )
            }
            onClick={(event) =>
              refreshActiveQuery(
                event.currentTarget.value,
                event.currentTarget.selectionStart
              )
            }
            onCompositionEnd={handleCompositionEnd}
            onCompositionStart={() => {
              setComposing(true);
              setActiveQuery(null);
              setCandidates([]);
              searchIdentityRef.current += 1;
              searchControllerRef.current?.abort();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment. Type @ followed by a name to mention someone."
            ref={textareaRef}
            rows={4}
            value={body}
          />
          {menuOpen && (
            <div className="mt-2 rounded-xl border bg-popover p-2 shadow-xs">
              <div
                aria-busy={searchPending || undefined}
                aria-label="Mention candidates"
                className="max-h-48 overflow-y-auto"
                id={listId}
                role="listbox"
              >
                {candidates.map((candidate, index) => (
                  <button
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                      index === activeIndex && "bg-muted"
                    )}
                    id={`${listId}-option-${index}`}
                    key={candidate.id}
                    onClick={() => selectCandidate(candidate)}
                    onMouseDown={(event) => event.preventDefault()}
                    role="option"
                    tabIndex={-1}
                    type="button"
                  >
                    <span className="min-w-0 truncate">
                      {candidate.displayName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {shortId(candidate.id)}
                    </span>
                  </button>
                ))}
                {searchPending && candidates.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">
                    Searching...
                  </p>
                )}
                {!searchPending && !searchError && candidates.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">
                    No matching workspace members.
                  </p>
                )}
              </div>
              {searchError && (
                <div className="flex items-center justify-between gap-3 p-2 text-sm">
                  <p className="text-destructive-emphasis">{searchError}</p>
                  <Button
                    onClick={() =>
                      setActiveQuery((current) =>
                        current ? { ...current } : current
                      )
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <FieldDescription>
            <AtSign aria-hidden="true" className="mr-1 inline size-3.5" />
            Mentions are validated when you post.
          </FieldDescription>
          <span className="text-xs text-muted-foreground">
            {body.length}/{MAX_COMMENT_LENGTH}
          </span>
        </div>
        <FieldError id={errorId}>{validationError}</FieldError>
      </Field>
      <p aria-live="polite" className="sr-only" id={statusId}>
        {searchPending
          ? "Searching mention candidates"
          : `${candidates.length} mention candidates`}
      </p>
      {requestError && (
        <Alert variant="destructive">
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end">
        <Button disabled={pending} type="submit">
          <Send aria-hidden="true" />
          {pending ? "Posting..." : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
