import type { PrismaService } from "../../src/database/prisma.service";
import { Prisma } from "../../src/generated/prisma/client";
import { WorkspacesService } from "../../src/workspaces/workspaces.service";

type TransactionClient = {
  workspace: {
    create: jest.Mock;
  };
};

describe("WorkspacesService", () => {
  it("returns a safe conflict only after all slug attempts are exhausted", async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: { target: ["slug"] }
      }
    );
    const workspaceCreate = jest.fn().mockRejectedValue(uniqueError);
    const transactionClient: TransactionClient = {
      workspace: { create: workspaceCreate }
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (transaction: TransactionClient) => Promise<unknown>) =>
          callback(transactionClient)
      )
    } as unknown as PrismaService;
    const service = new WorkspacesService(prisma);

    await expect(
      service.create("user-1", { name: "Product Team" })
    ).rejects.toMatchObject({
      response: {
        message: "Workspace slug is already in use",
        code: "RESOURCE_CONFLICT"
      }
    });

    const attemptedSlugs = workspaceCreate.mock.calls.map(
      ([input]: [
        {
          data: {
            slug: string;
          };
        }
      ]) => input.data.slug
    );
    expect(attemptedSlugs.slice(0, 5)).toEqual([
      "product-team",
      "product-team-2",
      "product-team-3",
      "product-team-4",
      "product-team-5"
    ]);
    expect(attemptedSlugs).toHaveLength(15);
    const randomSlugs = attemptedSlugs.slice(5);
    expect(randomSlugs).toHaveLength(10);
    for (const slug of randomSlugs) {
      expect(slug).toEqual(expect.stringMatching(/^product-team-[a-f0-9]{8}$/));
    }
  });
});
