"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import {
  Download,
  FileImage,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceRole } from "@/features/workspaces/model/workspace-contract";
import { ApiError } from "@/lib/api/api-error";

import {
  deleteAttachment,
  downloadAttachment,
  listAttachments,
  triggerAttachmentDownload,
  uploadAttachment
} from "../api/attachments-api";
import {
  emptyAttachmentCollection,
  reconcileAttachmentPage,
  type AttachmentCollection
} from "../model/attachment-collection";
import {
  attachmentErrorMessage,
  isAttachmentAbortError
} from "../model/attachment-error-message";
import {
  validateAttachmentSelection,
  type PublicAttachment
} from "../model/attachment-contract";

type ListState = "loading" | "success" | "error";
type UploadStatus = "ready" | "uploading" | "canceled" | "error";

type UploadAttempt = {
  file: File;
  idempotencyKey: string;
  status: UploadStatus;
  progress: number | null;
  message: string | null;
};

type AttachmentSectionProps = {
  actorId: string;
  membershipRole: WorkspaceRole;
  projectId: string;
  taskId: string;
  workspaceId: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function canDeleteAttachment(
  attachment: PublicAttachment,
  actorId: string,
  membershipRole: WorkspaceRole
): boolean {
  return (
    membershipRole === "OWNER" ||
    membershipRole === "ADMIN" ||
    attachment.creator?.id === actorId
  );
}

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export function AttachmentSection({
  actorId,
  membershipRole,
  projectId,
  taskId,
  workspaceId
}: AttachmentSectionProps) {
  const [listState, setListState] = useState<ListState>("loading");
  const [collection, setCollection] = useState<AttachmentCollection>(
    emptyAttachmentCollection
  );
  const [listError, setListError] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<UploadAttempt | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicAttachment | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockedDeleteIds, setBlockedDeleteIds] = useState<Set<string>>(
    () => new Set()
  );
  const listControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const downloadControllerRef = useRef<AbortController | null>(null);
  const deleteControllerRef = useRef<AbortController | null>(null);
  const listRequestIdRef = useRef(0);
  const uploadPendingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);
  const canUpload = membershipRole !== "VIEWER";

  const loadInitial = useCallback(async () => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++listRequestIdRef.current;
    listControllerRef.current = controller;
    setListState("loading");
    setListError(null);
    setPageError(null);
    setPagePending(false);
    try {
      const page = await listAttachments(
        { workspaceId, projectId, taskId },
        { signal: controller.signal }
      );
      if (!controller.signal.aborted && requestId === listRequestIdRef.current) {
        setCollection((current) =>
          reconcileAttachmentPage(current, page, "replace")
        );
        setListState("success");
      }
    } catch (error: unknown) {
      if (
        !controller.signal.aborted &&
        requestId === listRequestIdRef.current &&
        !isAttachmentAbortError(error)
      ) {
        setListError(attachmentErrorMessage(error));
        setListState("error");
      }
    }
  }, [projectId, taskId, workspaceId]);

  useEffect(() => {
    void loadInitial();
    return () => {
      listRequestIdRef.current += 1;
      listControllerRef.current?.abort();
      uploadControllerRef.current?.abort();
      downloadControllerRef.current?.abort();
      deleteControllerRef.current?.abort();
    };
  }, [loadInitial]);

  async function loadMore() {
    if (!collection.nextCursor || pagePending) {
      return;
    }
    listControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++listRequestIdRef.current;
    listControllerRef.current = controller;
    setPagePending(true);
    setPageError(null);
    try {
      const page = await listAttachments(
        { workspaceId, projectId, taskId },
        { cursor: collection.nextCursor, signal: controller.signal }
      );
      if (!controller.signal.aborted && requestId === listRequestIdRef.current) {
        setCollection((current) =>
          reconcileAttachmentPage(current, page, "append")
        );
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isAttachmentAbortError(error)) {
        setPageError(attachmentErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted && requestId === listRequestIdRef.current) {
        setPagePending(false);
      }
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = validateAttachmentSelection(
      event.currentTarget.files?.[0] ?? null
    );
    setUploadNotice(null);
    if (!selected.success) {
      setSelectionError(selected.message);
      setAttempt(null);
      event.currentTarget.value = "";
      return;
    }
    setSelectionError(null);
    setAttempt({
      file: selected.file,
      idempotencyKey: newIdempotencyKey(),
      status: "ready",
      progress: 0,
      message: null
    });
  }

  async function startUpload() {
    if (!attempt || uploadPendingRef.current) {
      return;
    }
    const activeAttempt = attempt;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    uploadPendingRef.current = true;
    setUploadNotice(null);
    setAttempt({
      ...activeAttempt,
      status: "uploading",
      progress: 0,
      message: null
    });
    try {
      await uploadAttachment(
        { workspaceId, projectId, taskId },
        activeAttempt.file,
        {
          idempotencyKey: activeAttempt.idempotencyKey,
          signal: controller.signal,
          onProgress: ({ percent }) => {
            setAttempt((current) =>
              current?.idempotencyKey === activeAttempt.idempotencyKey
                ? { ...current, progress: percent }
                : current
            );
          }
        }
      );
      if (!controller.signal.aborted) {
        setAttempt(null);
        setInputKey((current) => current + 1);
        setUploadNotice(`${activeAttempt.file.name} uploaded.`);
        await loadInitial();
      }
    } catch (error: unknown) {
      if (isAttachmentAbortError(error)) {
        setAttempt((current) =>
          current?.idempotencyKey === activeAttempt.idempotencyKey
            ? {
                ...current,
                status: "canceled",
                progress: null,
                message:
                  "Upload canceled locally. Retry safely or refresh to reconcile."
              }
            : current
        );
        void loadInitial();
      } else {
        setAttempt((current) =>
          current?.idempotencyKey === activeAttempt.idempotencyKey
            ? {
                ...current,
                status: "error",
                progress: null,
                message: attachmentErrorMessage(error)
              }
            : current
        );
      }
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
      }
      uploadPendingRef.current = false;
    }
  }

  async function startDownload(attachment: PublicAttachment) {
    if (downloadingId || attachment.status !== "AVAILABLE") {
      return;
    }
    downloadControllerRef.current?.abort();
    const controller = new AbortController();
    downloadControllerRef.current = controller;
    setDownloadingId(attachment.id);
    setDownloadError(null);
    try {
      const blob = await downloadAttachment(
        { workspaceId, projectId, taskId },
        attachment,
        controller.signal
      );
      if (!controller.signal.aborted) {
        triggerAttachmentDownload(blob, attachment.filename);
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isAttachmentAbortError(error)) {
        setDownloadError(attachmentErrorMessage(error));
        if (error instanceof ApiError && error.status === 404) {
          void loadInitial();
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setDownloadingId(null);
      }
    }
  }

  function focusAttachmentFallback() {
    queueMicrotask(() => (fileInputRef.current ?? headingRef.current)?.focus());
  }

  async function confirmDelete() {
    if (!deleteTarget || deletePending) {
      return;
    }
    const target = deleteTarget;
    const controller = new AbortController();
    deleteControllerRef.current = controller;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteAttachment(
        { workspaceId, projectId, taskId },
        target.id,
        controller.signal
      );
      if (!controller.signal.aborted) {
        setCollection((current) => ({
          ...current,
          items: current.items.filter(({ id }) => id !== target.id)
        }));
        setDeleteTarget(null);
        setUploadNotice(`${target.filename} deleted.`);
        focusAttachmentFallback();
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isAttachmentAbortError(error)) {
        setDeleteError(attachmentErrorMessage(error));
        if (
          error instanceof ApiError &&
          (error.status === 403 || error.status === 404)
        ) {
          setBlockedDeleteIds((current) => new Set(current).add(target.id));
          setDeleteTarget(null);
          void loadInitial();
          focusAttachmentFallback();
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setDeletePending(false);
      }
    }
  }

  return (
    <section
      aria-labelledby={`attachments-${taskId}`}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <Paperclip aria-hidden="true" className="size-5 text-primary-emphasis" />
        <h3
          className="font-semibold"
          id={`attachments-${taskId}`}
          ref={headingRef}
          tabIndex={-1}
        >
          Attachments
        </h3>
      </div>

      {canUpload ? (
        <FieldGroup>
          <Field data-invalid={Boolean(selectionError)}>
            <FieldLabel htmlFor={`attachment-file-${taskId}`}>
              Choose an image
            </FieldLabel>
            <Input
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              aria-describedby={`attachment-file-help-${taskId}`}
              aria-invalid={Boolean(selectionError)}
              disabled={attempt?.status === "uploading"}
              id={`attachment-file-${taskId}`}
              key={inputKey}
              onChange={selectFile}
              ref={fileInputRef}
              type="file"
            />
            <FieldDescription id={`attachment-file-help-${taskId}`}>
              PNG or JPEG only, up to 10 MiB. One file at a time.
            </FieldDescription>
            <FieldError>{selectionError}</FieldError>
          </Field>
        </FieldGroup>
      ) : (
        <Alert>
          <AlertDescription>
            Your VIEWER role can download attachments but cannot upload them.
          </AlertDescription>
        </Alert>
      )}

      {attempt && (
        <div className="flex flex-col gap-3 rounded-xl border bg-background p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="wrap-break-word text-sm font-medium">
                {attempt.file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(attempt.file.size)}
              </p>
            </div>
            <Badge variant="secondary">{attempt.status}</Badge>
          </div>

          {attempt.status === "uploading" && (
            <Progress value={attempt.progress}>
              <ProgressLabel>Uploading</ProgressLabel>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {attempt.progress === null
                  ? "In progress"
                  : `${attempt.progress}%`}
              </span>
            </Progress>
          )}

          {attempt.message && (
            <Alert
              variant={attempt.status === "error" ? "destructive" : "default"}
            >
              <AlertDescription>{attempt.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            {attempt.status === "ready" && (
              <Button onClick={() => void startUpload()} type="button">
                <Upload aria-hidden="true" data-icon="inline-start" />
                Upload attachment
              </Button>
            )}
            {attempt.status === "uploading" && (
              <Button
                onClick={() => uploadControllerRef.current?.abort()}
                type="button"
                variant="outline"
              >
                <X aria-hidden="true" data-icon="inline-start" />
                Cancel upload
              </Button>
            )}
            {(attempt.status === "canceled" || attempt.status === "error") && (
              <Button onClick={() => void startUpload()} type="button">
                <RotateCcw aria-hidden="true" data-icon="inline-start" />
                Retry upload
              </Button>
            )}
          </div>
        </div>
      )}

      {uploadNotice && (
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground"
          role="status"
        >
          {uploadNotice}
        </p>
      )}

      {listState === "loading" && (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only" role="status">
            Loading attachments...
          </span>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {listState === "error" && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive">
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
          <Button
            onClick={() => void loadInitial()}
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            Retry attachments
          </Button>
        </div>
      )}

      {listState === "success" && (
        <div className="flex flex-col gap-3">
          {collection.items.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileImage aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No attachments yet</EmptyTitle>
                <EmptyDescription>
                  {canUpload
                    ? "Choose a PNG or JPEG to attach it to this task."
                    : "No files are available for this task."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {collection.items.map((attachment) => {
                const canDelete =
                  canDeleteAttachment(attachment, actorId, membershipRole) &&
                  !blockedDeleteIds.has(attachment.id);
                const unavailable = attachment.status === "DELETE_FAILED";
                return (
                  <li
                    className="flex min-w-0 flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                    key={attachment.id}
                  >
                    <div className="min-w-0">
                      <p className="wrap-break-word text-sm font-medium">
                        {attachment.filename}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBytes(attachment.size)} ·{" "}
                        {formatDate(attachment.createdAt)}
                        {attachment.creator
                          ? ` · ${attachment.creator.displayName}`
                          : " · Former member"}
                      </p>
                      {unavailable && (
                        <p className="mt-1 text-xs text-destructive-emphasis">
                          Delete cleanup failed. This attachment cannot be
                          downloaded.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        disabled={Boolean(downloadingId) || unavailable}
                        onClick={() => void startDownload(attachment)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Download aria-hidden="true" data-icon="inline-start" />
                        {downloadingId === attachment.id
                          ? "Downloading..."
                          : "Download"}
                      </Button>
                      {canDelete && (
                        <Button
                          aria-label={`${unavailable ? "Retry delete" : "Delete"} ${attachment.filename}`}
                          onClick={(event) => {
                            deleteReturnFocusRef.current = event.currentTarget;
                            setDeleteError(null);
                            setDeleteTarget(attachment);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 aria-hidden="true" data-icon="inline-start" />
                          {unavailable ? "Retry delete" : "Delete"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pageError && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{pageError}</span>
                  <Button
                    disabled={pagePending}
                    onClick={() => void loadMore()}
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
          {collection.nextCursor && !pageError && (
            <div className="flex justify-center">
              <Button
                disabled={pagePending}
                onClick={() => void loadMore()}
                size="sm"
                type="button"
                variant="outline"
              >
                {pagePending ? "Loading..." : "Load older attachments"}
              </Button>
            </div>
          )}
        </div>
      )}

      {downloadError && (
        <Alert variant="destructive">
          <AlertDescription>{downloadError}</AlertDescription>
        </Alert>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deletePending) {
            setDeleteTarget(null);
            queueMicrotask(() => deleteReturnFocusRef.current?.focus());
          }
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.filename ?? "attachment"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the attachment. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              Keep attachment
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              variant="destructive"
            >
              {deletePending ? "Deleting..." : "Delete attachment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
