import type { PrismaService } from "../../src/database/prisma.service";
import { WorkspaceRole } from "../../src/generated/prisma/client";
import type { WorkspaceAuthorizationService } from "../../src/workspaces/workspace-authorization.service";
import { ProjectsService } from "../../src/projects/projects.service";

describe("ProjectsService", () => {
  const actor = {
    workspaceId: "workspace-1",
    userId: "user-1",
    role: WorkspaceRole.MEMBER
  };

  it("passes the active transaction to actor resolution and scopes list queries", async () => {
    const transaction = {
      project: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "project-1",
            name: "WorkSync",
            key: "WSYNC",
            createdAt: new Date("2026-07-30T10:00:00.000Z"),
            updatedAt: new Date("2026-07-30T10:00:00.000Z")
          }
        ])
      }
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (database: typeof transaction) => Promise<unknown>) =>
          callback(transaction)
      )
    } as unknown as PrismaService;
    const workspaceAuthorization = {
      requireActor: jest.fn().mockResolvedValue(actor)
    } as unknown as WorkspaceAuthorizationService;
    const service = new ProjectsService(prisma, workspaceAuthorization);

    await expect(
      service.list(actor.userId, actor.workspaceId, {
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({ total: 1, page: 1, pageSize: 20 });

    expect(workspaceAuthorization.requireActor).toHaveBeenCalledWith(
      actor.userId,
      actor.workspaceId,
      transaction
    );
    expect(transaction.project.count).toHaveBeenCalledWith({
      where: { workspaceId: actor.workspaceId }
    });
    expect(transaction.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: actor.workspaceId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: 0,
        take: 20
      })
    );
  });

  it("scopes project lookup before updating by id", async () => {
    const transaction = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: "project-1" }),
        update: jest.fn().mockResolvedValue({
          id: "project-1",
          name: "WorkSync Platform",
          key: "WSYNC",
          createdAt: new Date("2026-07-30T10:00:00.000Z"),
          updatedAt: new Date("2026-07-30T11:00:00.000Z")
        })
      }
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (database: typeof transaction) => Promise<unknown>) =>
          callback(transaction)
      )
    } as unknown as PrismaService;
    const workspaceAuthorization = {
      requireActor: jest.fn().mockResolvedValue(actor)
    } as unknown as WorkspaceAuthorizationService;
    const service = new ProjectsService(prisma, workspaceAuthorization);

    await service.update(
      actor.userId,
      actor.workspaceId,
      "project-1",
      { name: "WorkSync Platform" }
    );

    expect(transaction.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-1",
        workspaceId: actor.workspaceId
      },
      select: { id: true }
    });
    expect(transaction.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "project-1" },
        data: { name: "WorkSync Platform" }
      })
    );
  });
});
