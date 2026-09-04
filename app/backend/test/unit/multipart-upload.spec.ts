import { PassThrough } from "node:stream";

import type { Request } from "express";

import { parseAttachmentUpload } from "../../src/attachments/multipart-upload";

describe("multipart upload cancellation", () => {
  it("propagates a request abort to the file stream and completion", async () => {
    const request = new PassThrough() as PassThrough & Pick<Request, "headers">;
    request.headers = {
      "content-type": "multipart/form-data; boundary=attachment-test-boundary"
    };
    const ready = parseAttachmentUpload(request as unknown as Request);
    request.write(
      "--attachment-test-boundary\r\n" +
        'Content-Disposition: form-data; name="file"; filename="image.png"\r\n' +
        "Content-Type: image/png\r\n\r\n" +
        "partial-file"
    );
    const upload = await ready;
    const completed = expect(upload.completed).rejects.toMatchObject({
      reasonCode: "CLIENT_ABORTED"
    });

    request.emit("aborted");

    await completed;
    expect(upload.abortController.signal.aborted).toBe(true);
    expect(upload.stream.destroyed).toBe(true);
    request.destroy();
  });
});
