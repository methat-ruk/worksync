import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { ConfigService } from "@nestjs/config";

import { S3StorageService } from "../../src/attachments/storage/s3-storage.service";
import type { Environment } from "../../src/config/environment";

async function readBody(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("S3-compatible storage integration", () => {
  let storage: S3StorageService;

  beforeAll(() => {
    const values = {
      NODE_ENV: "test",
      S3_REGION: process.env.S3_REGION!,
      S3_BUCKET: process.env.S3_BUCKET!,
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
      S3_ENDPOINT: process.env.S3_ENDPOINT!,
      S3_FORCE_PATH_STYLE: true
    } as Environment;
    storage = new S3StorageService(
      new ConfigService<Environment, true>(values)
    );
  });

  afterAll(() => storage.onModuleDestroy());

  it("creates the test bucket and streams an object lifecycle", async () => {
    const key = `integration/${randomUUID()}`;
    const bytes = Buffer.from("real-minio-streaming-evidence");
    await storage.upload(key, Readable.from([bytes]), new AbortController());
    await expect(storage.head(key)).resolves.toEqual({
      exists: true,
      contentLength: bytes.length
    });
    const stored = await storage.get(key);
    await expect(readBody(stored.body)).resolves.toEqual(bytes);
    await storage.delete(key);
    await expect(storage.head(key)).resolves.toEqual({ exists: false });
  });
});
