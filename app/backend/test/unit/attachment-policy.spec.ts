import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  AttachmentInspectionTransform,
  AttachmentPolicyError,
  normalizeAttachmentFilename,
  validateDeclaredAttachmentType
} from "../../src/attachments/attachment-policy";

async function inspect(
  bytes: Buffer,
  declaredContentType: "image/png" | "image/jpeg",
  declaredSize = bytes.length
) {
  const inspection = new AttachmentInspectionTransform(
    declaredContentType,
    declaredSize
  );
  await pipeline(
    Readable.from([bytes]),
    inspection,
    new Writable({
      write: (_chunk, _encoding, callback) => callback()
    })
  );
  return inspection.result();
}

describe("attachment policy", () => {
  it("normalizes safe display names and enforces matching extensions", () => {
    expect(normalizeAttachmentFilename("  cafe\u0301.png  ")).toBe("café.png");
    expect(validateDeclaredAttachmentType("image.PNG", "image/png")).toBe(
      "image/png"
    );
    expect(validateDeclaredAttachmentType("photo.jpeg", "image/jpeg")).toBe(
      "image/jpeg"
    );
  });

  it.each([
    "",
    "../photo.png",
    "folder/photo.png",
    "folder\\photo.png",
    "photo\u0000.png",
    "photo\u202e.png"
  ])("rejects unsafe display filename %p", (filename) => {
    expect(() => normalizeAttachmentFilename(filename)).toThrow(
      AttachmentPolicyError
    );
  });

  it("rejects extension and declared MIME mismatches", () => {
    expect(() => validateDeclaredAttachmentType("photo.jpg", "image/png")).toThrow(
      "UNSUPPORTED_CONTENT_TYPE"
    );
    expect(() => validateDeclaredAttachmentType("document.svg", "image/svg+xml"))
      .toThrow("UNSUPPORTED_CONTENT_TYPE");
    expect(() => validateDeclaredAttachmentType("page.html", "text/html")).toThrow(
      "UNSUPPORTED_CONTENT_TYPE"
    );
    expect(() => validateDeclaredAttachmentType("archive.zip", "application/zip"))
      .toThrow("UNSUPPORTED_CONTENT_TYPE");
  });

  it("streams and fingerprints valid PNG content", async () => {
    const bytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("bounded-payload")
    ]);
    await expect(inspect(bytes, "image/png")).resolves.toMatchObject({
      authoritativeSize: bytes.length,
      detectedContentType: "image/png",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
  });

  it("forwards inspected chunks before a slow source completes", async () => {
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
    const tail = Buffer.from("slow-tail");
    let releaseTail!: () => void;
    const tailReady = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });
    let observeFirstChunk!: () => void;
    const firstChunkObserved = new Promise<void>((resolve) => {
      observeFirstChunk = resolve;
    });
    const received: Buffer[] = [];
    const source = Readable.from(
      (async function* slowSource() {
        yield signature;
        await tailReady;
        yield tail;
      })()
    );
    const inspection = new AttachmentInspectionTransform(
      "image/png",
      signature.length + tail.length
    );
    const completed = pipeline(
      source,
      inspection,
      new Writable({
        write: (chunk: Buffer, _encoding, callback) => {
          received.push(Buffer.from(chunk));
          if (received.length === 1) {
            observeFirstChunk();
          }
          callback();
        }
      })
    );

    await firstChunkObserved;
    expect(received).toEqual([signature]);
    releaseTail();
    await expect(completed).resolves.toBeUndefined();
    expect(Buffer.concat(received)).toEqual(Buffer.concat([signature, tail]));
  });

  it("rejects signature and authoritative size mismatches", async () => {
    await expect(inspect(Buffer.from("not-an-image"), "image/png")).rejects.toThrow(
      "CONTENT_SIGNATURE_MISMATCH"
    );
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await expect(inspect(jpeg, "image/jpeg", jpeg.length + 1)).rejects.toThrow(
      "SIZE_MISMATCH"
    );
  });
});
