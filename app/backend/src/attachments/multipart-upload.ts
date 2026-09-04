import type { Readable } from "node:stream";

import busboy = require("busboy");
import type { Request } from "express";

import { MAX_ATTACHMENT_BYTES } from "./attachment-policy";

export class MultipartUploadError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "MultipartUploadError";
  }
}

export type ParsedAttachmentUpload = Readonly<{
  filename: string;
  contentType: string;
  stream: Readable;
  completed: Promise<void>;
  abortController: AbortController;
}>;

export function parseAttachmentUpload(
  request: Request
): Promise<ParsedAttachmentUpload> {
  let parser: busboy.Busboy;
  try {
    parser = busboy({
      headers: request.headers,
      defParamCharset: "utf8",
      preservePath: true,
      limits: {
        files: 2,
        fields: 1,
        parts: 2,
        fileSize: MAX_ATTACHMENT_BYTES + 1,
        headerPairs: 50
      }
    });
  } catch {
    return Promise.reject(new MultipartUploadError("INVALID_MULTIPART"));
  }

  const abortController = new AbortController();
  let fileStream: Readable | undefined;
  let fileSeen = false;
  let settled = false;
  let resolveReady!: (upload: ParsedAttachmentUpload) => void;
  let rejectReady!: (error: Error) => void;
  let resolveCompleted!: () => void;
  let rejectCompleted!: (error: Error) => void;
  const completed = new Promise<void>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });
  void completed.catch(() => undefined);
  const ready = new Promise<ParsedAttachmentUpload>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const fail = (reasonCode: string) => {
    if (settled) {
      return;
    }
    settled = true;
    const error = new MultipartUploadError(reasonCode);
    abortController.abort();
    fileStream?.destroy(error);
    rejectCompleted(error);
    if (!fileSeen) {
      rejectReady(error);
    }
  };

  parser.on("file", (fieldName, stream, info) => {
    if (fileSeen || fieldName !== "file") {
      stream.resume();
      fail("INVALID_MULTIPART");
      return;
    }
    fileSeen = true;
    fileStream = stream;
    stream.pause();
    stream.once("limit", () => fail("FILE_TOO_LARGE"));
    stream.once("error", () => fail("MULTIPART_STREAM_FAILED"));
    resolveReady({
      filename: info.filename,
      contentType: info.mimeType,
      stream,
      completed,
      abortController
    });
  });
  parser.on("field", () => fail("INVALID_MULTIPART"));
  parser.on("filesLimit", () => fail("INVALID_MULTIPART"));
  parser.on("fieldsLimit", () => fail("INVALID_MULTIPART"));
  parser.on("partsLimit", () => fail("INVALID_MULTIPART"));
  parser.on("error", () => fail("INVALID_MULTIPART"));
  parser.on("close", () => {
    if (!fileSeen) {
      fail("FILE_REQUIRED");
      return;
    }
    if (!settled) {
      settled = true;
      resolveCompleted();
    }
  });
  request.once("aborted", () => fail("CLIENT_ABORTED"));
  request.once("error", () => fail("MULTIPART_STREAM_FAILED"));
  request.pipe(parser);
  return ready;
}
