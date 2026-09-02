import { CommentsService } from "../../src/comments/comments.service";
import { Prisma } from "../../src/generated/prisma/client";

describe("CommentsService", () => {
  it("returns a stable conflict after serializable retries are exhausted", async () => {
    const transaction = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("write conflict", {
        code: "P2034",
        clientVersion: "7.9.0"
      })
    );
    const service = new CommentsService(
      { $transaction: transaction } as never,
      {} as never,
      {} as never
    );

    await expect(
      service.create("author-1", "workspace-1", "project-1", "task-1", {
        body: "Retry this comment",
        mentions: []
      })
    ).rejects.toMatchObject({
      response: {
        message: "Comment changed concurrently; retry the request",
        code: "RESOURCE_CONFLICT"
      }
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
