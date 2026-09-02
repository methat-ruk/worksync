import type { PrismaService } from "../../src/database/prisma.service";
import {
  Prisma,
  WorkspaceRole
} from "../../src/generated/prisma/client";
import type { WorkspaceAuthorizationService } from "../../src/workspaces/workspace-authorization.service";
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
    const workspaceAuthorization = {
      requireActor: jest.fn()
    } as unknown as WorkspaceAuthorizationService;
    const service = new WorkspacesService(prisma, workspaceAuthorization);

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

  describe("workspace actor transaction propagation", () => {
    const workspaceId = "workspace-1";
    const userId = "owner-1";
    const createdAt = new Date("2026-07-24T00:00:00.000Z");
    let transaction: {
      workspaceMember: {
        count: jest.Mock;
        findMany: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
      };
      user: {
        findUnique: jest.Mock;
      };
      task: {
        updateMany: jest.Mock;
      };
      notification: {
        deleteMany: jest.Mock;
      };
    };
    let workspaceAuthorization: {
      requireActor: jest.Mock;
    };
    let service: WorkspacesService;

    beforeEach(() => {
      transaction = {
        workspaceMember: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn()
        },
        user: {
          findUnique: jest.fn()
        },
        task: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 })
        },
        notification: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 })
        }
      };
      const prisma = {
        $transaction: jest.fn(
          (callback: (database: typeof transaction) => Promise<unknown>) =>
            callback(transaction)
        )
      } as unknown as PrismaService;
      workspaceAuthorization = {
        requireActor: jest.fn().mockResolvedValue({
          workspaceId,
          userId,
          role: WorkspaceRole.OWNER
        })
      };
      service = new WorkspacesService(
        prisma,
        workspaceAuthorization as unknown as WorkspaceAuthorizationService
      );
    });

    it("passes the list-members transaction to actor resolution", async () => {
      await service.listMembers(userId, workspaceId, {
        page: 1,
        pageSize: 20
      });

      expect(workspaceAuthorization.requireActor).toHaveBeenCalledWith(
        userId,
        workspaceId,
        transaction
      );
    });

    it("passes the add-member transaction to actor resolution", async () => {
      transaction.user.findUnique.mockResolvedValue({ id: "member-user-1" });
      transaction.workspaceMember.create.mockResolvedValue({
        id: "membership-1",
        userId: "member-user-1",
        role: WorkspaceRole.MEMBER,
        createdAt,
        user: {
          email: "member@example.com",
          displayName: "Member"
        }
      });

      await service.addMember(userId, workspaceId, {
        email: "member@example.com",
        role: WorkspaceRole.MEMBER
      });

      expect(workspaceAuthorization.requireActor).toHaveBeenCalledWith(
        userId,
        workspaceId,
        transaction
      );
    });

    it("passes the update-member transaction to actor resolution", async () => {
      transaction.workspaceMember.findFirst.mockResolvedValue({
        id: "membership-1",
        userId: "member-user-1",
        role: WorkspaceRole.ADMIN
      });
      transaction.workspaceMember.update.mockResolvedValue({
        id: "membership-1",
        userId: "member-user-1",
        role: WorkspaceRole.MEMBER,
        createdAt,
        user: {
          email: "member@example.com",
          displayName: "Member"
        }
      });

      await service.updateMember(
        userId,
        workspaceId,
        "membership-1",
        { role: WorkspaceRole.MEMBER }
      );

      expect(workspaceAuthorization.requireActor).toHaveBeenCalledWith(
        userId,
        workspaceId,
        transaction
      );
    });

    it("passes the remove-member transaction to actor resolution", async () => {
      transaction.workspaceMember.findFirst.mockResolvedValue({
        id: "membership-1",
        userId: "member-user-1",
        role: WorkspaceRole.ADMIN
      });

      await service.removeMember(userId, workspaceId, "membership-1");

      expect(workspaceAuthorization.requireActor).toHaveBeenCalledWith(
        userId,
        workspaceId,
        transaction
      );
      expect(transaction.task.updateMany).toHaveBeenCalledWith({
        where: {
          assigneeId: "member-user-1",
          project: { workspaceId }
        },
        data: { assigneeId: null }
      });
      expect(transaction.notification.deleteMany).toHaveBeenCalledWith({
        where: { workspaceId, recipientId: "member-user-1" }
      });
      expect(transaction.workspaceMember.delete).toHaveBeenCalledWith({
        where: { id: "membership-1" }
      });
    });
  });
});
