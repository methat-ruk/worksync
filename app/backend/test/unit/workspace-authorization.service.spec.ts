import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { ConfigurationModule } from "../../src/config/configuration.module";
import { PrismaService } from "../../src/database/prisma.service";
import {
  type Prisma,
  WorkspaceRole
} from "../../src/generated/prisma/client";
import { WorkspaceAuthorizationService } from "../../src/workspaces/workspace-authorization.service";
import { WorkspacesModule } from "../../src/workspaces/workspaces.module";

@Injectable()
class WorkspaceAuthorizationConsumer {
  constructor(
    readonly workspaceAuthorization: WorkspaceAuthorizationService
  ) {}
}

describe("WorkspaceAuthorizationService", () => {
  const rootFindUnique = jest.fn();
  const prisma = {
    workspaceMember: {
      findUnique: rootFindUnique
    }
  } as unknown as PrismaService;
  const service = new WorkspaceAuthorizationService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns only the trusted actor projection for current membership", async () => {
    rootFindUnique.mockResolvedValue({
      workspaceId: "workspace-1",
      userId: "user-1",
      role: WorkspaceRole.ADMIN
    });

    await expect(
      service.requireActor("user-1", "workspace-1")
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      userId: "user-1",
      role: WorkspaceRole.ADMIN
    });
    expect(rootFindUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: "workspace-1",
          userId: "user-1"
        }
      },
      select: {
        workspaceId: true,
        userId: true,
        role: true
      }
    });
  });

  it("uses the supplied transaction instead of the root Prisma client", async () => {
    const transactionFindUnique = jest.fn().mockResolvedValue({
      workspaceId: "workspace-1",
      userId: "user-1",
      role: WorkspaceRole.MEMBER
    });
    const transaction = {
      workspaceMember: {
        findUnique: transactionFindUnique
      }
    };

    await expect(
      service.requireActor(
        "user-1",
        "workspace-1",
        transaction as unknown as Prisma.TransactionClient
      )
    ).resolves.toMatchObject({
      workspaceId: "workspace-1",
      userId: "user-1",
      role: WorkspaceRole.MEMBER
    });
    expect(transactionFindUnique).toHaveBeenCalledTimes(1);
    expect(rootFindUnique).not.toHaveBeenCalled();
  });

  it("fails closed with the safe workspace-not-found contract", async () => {
    rootFindUnique.mockResolvedValue(null);

    await expect(
      service.requireActor("user-1", "workspace-missing")
    ).rejects.toMatchObject({
      response: {
        message: "Workspace not found",
        code: "RESOURCE_NOT_FOUND"
      },
      status: 404
    });
  });

  it("is exported by WorkspacesModule for downstream consumers", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigurationModule, WorkspacesModule],
      providers: [WorkspaceAuthorizationConsumer]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    expect(
      moduleRef.get(WorkspaceAuthorizationConsumer).workspaceAuthorization
    ).toBe(moduleRef.get(WorkspaceAuthorizationService));

    await moduleRef.close();
  });
});
