-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM (
  'PENDING',
  'AVAILABLE',
  'FAILED',
  'DELETING',
  'DELETE_FAILED'
);

-- CreateTable
CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "creatorId" TEXT,
  "displayFilename" VARCHAR(255) NOT NULL,
  "objectKey" VARCHAR(255) NOT NULL,
  "declaredContentType" VARCHAR(100) NOT NULL,
  "detectedContentType" VARCHAR(100),
  "declaredSize" BIGINT NOT NULL,
  "authoritativeSize" BIGINT,
  "sha256" CHAR(64),
  "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
  "failureReasonCode" VARCHAR(64),
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestFingerprint" CHAR(64) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_declaredSize_positive" CHECK ("declaredSize" > 0),
  CONSTRAINT "Attachment_authoritativeSize_positive" CHECK (
    "authoritativeSize" IS NULL OR "authoritativeSize" > 0
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_taskId_creatorId_idempotencyKey_key"
ON "Attachment"("taskId", "creatorId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Attachment_taskId_status_createdAt_id_idx"
ON "Attachment"("taskId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Attachment_status_lastAttemptAt_idx"
ON "Attachment"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "Attachment_creatorId_status_idx"
ON "Attachment"("creatorId", "status");

-- AddForeignKey
ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
