-- CreateTable
CREATE TABLE "CommentMention" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_taskId_createdAt_id_idx" ON "Comment"("taskId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CommentMention_commentId_start_end_key" ON "CommentMention"("commentId", "start", "end");

-- CreateIndex
CREATE INDEX "CommentMention_commentId_idx" ON "CommentMention"("commentId");

-- CreateIndex
CREATE INDEX "CommentMention_mentionedUserId_commentId_idx" ON "CommentMention"("mentionedUserId", "commentId");

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
