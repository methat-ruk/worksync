import {
  API_BASE_URL,
  apiRequest,
  runAuthenticatedRequest
} from "@/lib/api/api-client";
import { createApiError, parseApiError } from "@/lib/api/api-error";

import {
  ATTACHMENT_PAGE_SIZE,
  MAX_ATTACHMENT_BYTES,
  attachmentListResponseSchema,
  attachmentResponseSchema,
  type AttachmentListData,
  type PublicAttachment
} from "../model/attachment-contract";

type AttachmentScope = {
  workspaceId: string;
  projectId: string;
  taskId: string;
};

type UploadProgress = {
  loaded: number;
  total: number | null;
  percent: number | null;
};

type UploadAttachmentOptions = {
  idempotencyKey: string;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

type XhrResult = {
  status: number;
  payload: unknown;
};

function attachmentCollectionPath({
  workspaceId,
  projectId,
  taskId
}: AttachmentScope): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/attachments`;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function sendUploadAttempt(
  path: string,
  file: File,
  idempotencyKey: string,
  accessToken: string | null,
  signal?: AbortSignal,
  onProgress?: (progress: UploadProgress) => void
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => signal?.removeEventListener("abort", abort);
    const resolveOnce = (result: XhrResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };
    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => xhr.abort();

    xhr.open("POST", `${API_BASE_URL}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
    xhr.setRequestHeader("X-Upload-Length", String(file.size));
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : null;
      onProgress?.({
        loaded: event.loaded,
        total,
        percent: total ? Math.min(100, Math.round((event.loaded / total) * 100)) : null
      });
    };
    xhr.onload = () =>
      resolveOnce({ status: xhr.status, payload: parseJson(xhr.responseText) });
    xhr.onerror = () =>
      rejectOnce(new Error("Attachment upload could not reach the server"));
    xhr.onabort = () =>
      rejectOnce(new DOMException("Upload was canceled", "AbortError"));

    if (signal?.aborted) {
      rejectOnce(new DOMException("Upload was canceled", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export async function listAttachments(
  scope: AttachmentScope,
  {
    cursor,
    limit = ATTACHMENT_PAGE_SIZE,
    signal
  }: { cursor?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<AttachmentListData> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    query.set("cursor", cursor);
  }
  const response = await apiRequest(
    `${attachmentCollectionPath(scope)}?${query.toString()}`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return attachmentListResponseSchema.parse(await response.json()).data;
}

export async function uploadAttachment(
  scope: AttachmentScope,
  file: File,
  { idempotencyKey, signal, onProgress }: UploadAttachmentOptions
): Promise<PublicAttachment> {
  const result = await runAuthenticatedRequest<XhrResult>(
    (accessToken) =>
      sendUploadAttempt(
        attachmentCollectionPath(scope),
        file,
        idempotencyKey,
        accessToken,
        signal,
        onProgress
      ),
    {
      isUnauthorized: (uploadResult) => uploadResult.status === 401,
      ...(signal ? { signal } : {})
    }
  );
  if (result.status < 200 || result.status >= 300) {
    throw createApiError(result.status, result.payload);
  }
  return attachmentResponseSchema.parse(result.payload).data.attachment;
}

export async function downloadAttachment(
  scope: AttachmentScope,
  attachment: PublicAttachment,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await apiRequest(
    `${attachmentCollectionPath(scope)}/${encodeURIComponent(attachment.id)}/content`,
    signal ? { signal } : {},
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }

  const declaredLength = response.headers.get("Content-Length");
  const parsedLength = declaredLength ? Number(declaredLength) : Number.NaN;
  if (
    !Number.isSafeInteger(parsedLength) ||
    parsedLength !== attachment.size ||
    parsedLength <= 0 ||
    parsedLength > MAX_ATTACHMENT_BYTES ||
    response.headers.get("Content-Type") !== "application/octet-stream"
  ) {
    throw new Error("Attachment download response did not match its metadata");
  }

  const blob = await response.blob();
  if (blob.size !== parsedLength || blob.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment download size did not match its metadata");
  }
  return blob;
}

export function triggerAttachmentDownload(
  blob: Blob,
  filename: string
): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export async function deleteAttachment(
  scope: AttachmentScope,
  attachmentId: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await apiRequest(
    `${attachmentCollectionPath(scope)}/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE", ...(signal ? { signal } : {}) },
    { authenticated: true }
  );
  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status !== 204) {
    throw createApiError(response.status, null);
  }
}
