import { Readable } from "node:stream";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  Injectable,
  OnModuleDestroy
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Environment } from "../../config/environment";

export type StoredObject = Readonly<{
  body: Readable;
  contentLength?: number;
}>;

export type ObjectHead = Readonly<{
  exists: boolean;
  contentLength?: number;
}>;

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    record.name === "NotFound" ||
    record.name === "NoSuchKey" ||
    record.$metadata?.httpStatusCode === 404
  );
}

function isOwnedBucketRace(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "BucketAlreadyOwnedByYou"
  );
}

@Injectable()
export class S3StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly nodeEnvironment: Environment["NODE_ENV"];
  private readiness: Promise<void> | undefined;

  constructor(config: ConfigService<Environment, true>) {
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.nodeEnvironment = config.get("NODE_ENV", { infer: true });
    const accessKeyId = config.get("S3_ACCESS_KEY_ID", { infer: true });
    const secretAccessKey = config.get("S3_SECRET_ACCESS_KEY", { infer: true });
    this.client = new S3Client({
      region: config.get("S3_REGION", { infer: true }),
      endpoint: config.get("S3_ENDPOINT", { infer: true }),
      forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 3_000,
        requestTimeout: 30_000,
        socketTimeout: 15_000,
        throwOnRequestTimeout: true
      })
    });
  }

  async ensureReady(): Promise<void> {
    this.readiness ??= this.initializeBucket().catch((error: unknown) => {
      this.readiness = undefined;
      throw error;
    });
    await this.readiness;
  }

  private async initializeBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error: unknown) {
      if (this.nodeEnvironment === "production" || !isMissingObject(error)) {
        throw error;
      }
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error: unknown) {
      if (!isOwnedBucketRace(error)) {
        throw error;
      }
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async upload(
    objectKey: string,
    body: Readable,
    abortController: AbortController
  ): Promise<void> {
    await this.ensureReady();
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: "application/octet-stream"
      },
      queueSize: 1,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false,
      abortController
    });
    await upload.done();
  }

  async get(objectKey: string): Promise<StoredObject> {
    await this.ensureReady();
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey })
    );
    if (!(response.Body instanceof Readable)) {
      throw new Error("Object storage returned a non-streaming body");
    }
    return {
      body: response.Body,
      ...(response.ContentLength === undefined
        ? {}
        : { contentLength: response.ContentLength })
    };
  }

  async head(objectKey: string): Promise<ObjectHead> {
    await this.ensureReady();
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey })
      );
      return {
        exists: true,
        ...(response.ContentLength === undefined
          ? {}
          : { contentLength: response.ContentLength })
      };
    } catch (error: unknown) {
      if (isMissingObject(error)) {
        return { exists: false };
      }
      throw error;
    }
  }

  async delete(objectKey: string): Promise<void> {
    await this.ensureReady();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey })
    );
  }
}
