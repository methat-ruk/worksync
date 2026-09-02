import {
  HttpException,
  HttpStatus,
  type INestApplication
} from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { API_ERROR_CODE } from "../../src/common/errors/api-error-code";
import { AppModule } from "../../src/app.module";
import {
  AuthRateLimiterService,
  type AuthRateLimitPolicy
} from "../../src/auth/services/auth-rate-limit.service";
import { PrismaService } from "../../src/database/prisma.service";
import {
  Prisma,
  type AuthIdentity,
  type AuthProvider,
  type AuthSession,
  type Comment,
  type CommentMention,
  type Notification,
  type NotificationType,
  type Project,
  type Task,
  type TaskStatus,
  type User,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole
} from "../../src/generated/prisma/client";
import { GoogleOAuthProviderService } from "../../src/auth/services/google-oauth-provider.service";
import type { GoogleIdentityProfile } from "../../src/auth/types/google-oauth.types";
import type { PublicUser } from "../../src/auth/types/auth.types";
import { configureApplication } from "../../src/main";
import { createGoogleOAuthTestHarness } from "./google-oauth-test-harness";

type StoredUser = User;
type StoredProject = Project;
type StoredTask = Task;
type StoredComment = Comment;
type StoredCommentMention = CommentMention;
type StoredNotification = Notification;
type StoredWorkspace = Workspace;
type StoredWorkspaceMember = WorkspaceMember;

function publicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export type AuthTestContext = {
  app: INestApplication;
  identities: Map<string, AuthIdentity>;
  users: Map<string, StoredUser>;
  sessions: Map<string, AuthSession>;
  projects: Map<string, StoredProject>;
  tasks: Map<string, StoredTask>;
  comments: Map<string, StoredComment>;
  commentMentions: Map<string, StoredCommentMention>;
  notifications: Map<string, StoredNotification>;
  workspaces: Map<string, StoredWorkspace>;
  workspaceMembers: Map<string, StoredWorkspaceMember>;
};

export type AuthTestOptions = {
  googleProfile?: GoogleIdentityProfile;
  googleFailure?: Error;
  rateLimitedPolicies?: AuthRateLimitPolicy[];
};

export async function createAuthTestApp(
  options: AuthTestOptions = {}
): Promise<AuthTestContext> {
  const identities = new Map<string, AuthIdentity>();
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, AuthSession>();
  const projects = new Map<string, StoredProject>();
  const tasks = new Map<string, StoredTask>();
  const comments = new Map<string, StoredComment>();
  const commentMentions = new Map<string, StoredCommentMention>();
  const notifications = new Map<string, StoredNotification>();
  const workspaces = new Map<string, StoredWorkspace>();
  const workspaceMembers = new Map<string, StoredWorkspaceMember>();
  let sequence = 0;

  function workspaceVisibleTo(
    workspace: StoredWorkspace,
    userId: string
  ): boolean {
    return [...workspaceMembers.values()].some(
      (member) =>
        member.workspaceId === workspace.id && member.userId === userId
    );
  }

  function selectedWorkspace(
    workspace: StoredWorkspace,
    userId: string | undefined
  ): StoredWorkspace & { members: Array<{ role: WorkspaceRole }> } {
    const members = [...workspaceMembers.values()]
      .filter(
        (member) =>
          member.workspaceId === workspace.id &&
          (!userId || member.userId === userId)
      )
      .map((member) => ({ role: member.role }));
    return { ...workspace, members };
  }

  function selectedWorkspaceMember(
    member: StoredWorkspaceMember
  ): StoredWorkspaceMember & {
    user: { id: string; email: string; displayName: string };
  } {
    const user = users.get(member.userId);
    if (!user) {
      throw new Error("Workspace member user not found");
    }
    return {
      ...member,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    };
  }

  function selectedProject(project: StoredProject) {
    return {
      id: project.id,
      name: project.name,
      key: project.key,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  }

  function selectedTask(task: StoredTask) {
    const creator = users.get(task.creatorId);
    const assignee = task.assigneeId
      ? users.get(task.assigneeId) ?? null
      : null;
    if (!creator) {
      throw new Error("Task creator not found");
    }
    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status: task.status,
      dueDate: task.dueDate,
      creator: {
        id: creator.id,
        displayName: creator.displayName
      },
      assignee: assignee
        ? { id: assignee.id, displayName: assignee.displayName }
        : null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  function selectedComment(comment: StoredComment) {
    const author = users.get(comment.authorId);
    if (!author) {
      throw new Error("Comment author not found");
    }
    return {
      id: comment.id,
      taskId: comment.taskId,
      body: comment.body,
      author: { id: author.id, displayName: author.displayName },
      mentions: [...commentMentions.values()]
        .filter((mention) => mention.commentId === comment.id)
        .sort((left, right) => left.start - right.start || left.end - right.end)
        .map(({ start, end }) => ({ start, end })),
      createdAt: comment.createdAt
    };
  }

  function selectedNotification(notification: StoredNotification) {
    const workspace = workspaces.get(notification.workspaceId);
    const comment = comments.get(notification.commentId);
    const task = comment ? tasks.get(comment.taskId) : undefined;
    const project = task ? projects.get(task.projectId) : undefined;
    const author = comment ? users.get(comment.authorId) : undefined;
    if (!workspace || !comment || !task || !project || !author) {
      throw new Error("Notification source not found");
    }
    return {
      id: notification.id,
      type: notification.type,
      workspaceId: notification.workspaceId,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      workspace: { id: workspace.id, name: workspace.name },
      comment: {
        author: { id: author.id, displayName: author.displayName },
        task: {
          id: task.id,
          title: task.title,
          project: {
            id: project.id,
            key: project.key,
            name: project.name,
            workspaceId: project.workspaceId
          }
        }
      }
    };
  }

  function notificationMatchesRecipient(
    notification: StoredNotification,
    userId: string
  ): boolean {
    const workspace = workspaces.get(notification.workspaceId);
    return (
      notification.recipientId === userId &&
      Boolean(workspace && workspaceVisibleTo(workspace, userId))
    );
  }

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    authSession: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            id: string;
            userId: string;
            refreshTokenHash: string;
            userAgent: string | null;
            expiresAt: Date;
          };
        }): AuthSession => {
          const now = new Date();
          const session: AuthSession = {
            id: data.id,
            userId: data.userId,
            refreshTokenHash: data.refreshTokenHash,
            userAgent: data.userAgent,
            expiresAt: data.expiresAt,
            lastUsedAt: now,
            revokedAt: null,
            createdAt: now,
            updatedAt: now
          };
          sessions.set(session.id, session);
          return session;
        }
      ),
      findUnique: jest.fn(
        ({
          where
        }: {
          where: { id: string };
        }) => {
          const session = sessions.get(where.id);
          if (!session) {
            return null;
          }
          const user = users.get(session.userId);
          return user ? { ...session, user: publicUser(user) } : null;
        }
      ),
      findFirst: jest.fn(
        ({
          where
        }: {
          where: {
            id: string;
            userId: string;
            revokedAt: null;
            expiresAt: { gt: Date };
          };
        }) => {
          const session = sessions.get(where.id);
          const user = session ? users.get(session.userId) : undefined;
          if (
            !session ||
            !user ||
            session.userId !== where.userId ||
            session.revokedAt ||
            session.expiresAt <= where.expiresAt.gt
          ) {
            return null;
          }
          return { user: publicUser(user) };
        }
      ),
      updateMany: jest.fn(
        ({
          where,
          data
        }: {
          where: {
            id?: string;
            userId?: string;
            refreshTokenHash?: string;
            lastUsedAt?: Date;
            revokedAt?: null;
            expiresAt?: { gt: Date };
          };
          data: Partial<AuthSession>;
        }) => {
          let count = 0;
          for (const [id, session] of sessions) {
            if (
              (where.id && session.id !== where.id) ||
              (where.userId && session.userId !== where.userId) ||
              (where.refreshTokenHash &&
                session.refreshTokenHash !== where.refreshTokenHash) ||
              (where.lastUsedAt &&
                session.lastUsedAt.getTime() !== where.lastUsedAt.getTime()) ||
              (where.revokedAt === null && session.revokedAt !== null) ||
              (where.expiresAt && session.expiresAt <= where.expiresAt.gt)
            ) {
              continue;
            }
            sessions.set(id, {
              ...session,
              ...data,
              updatedAt: new Date()
            });
            count += 1;
          }
          return { count };
        }
      )
    },
    authIdentity: {
      findUnique: jest.fn(
        ({
          where
        }: {
          where: {
            provider_providerSubject: {
              provider: AuthProvider;
              providerSubject: string;
            };
          };
        }) => {
          const identity = [...identities.values()].find(
            (candidate) =>
              candidate.provider ===
                where.provider_providerSubject.provider &&
              candidate.providerSubject ===
                where.provider_providerSubject.providerSubject
          );
          if (!identity) {
            return null;
          }
          const user = users.get(identity.userId);
          return user ? { ...identity, user } : null;
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: { providerEmail: string };
        }) => {
          const identity = identities.get(where.id);
          if (!identity) {
            throw new Error("Identity not found");
          }
          const updated = {
            ...identity,
            ...data,
            updatedAt: new Date()
          };
          identities.set(updated.id, updated);
          return updated;
        }
      ),
      create: jest.fn(
        ({
          data
        }: {
          data: {
            userId: string;
            provider: AuthProvider;
            providerSubject: string;
            providerEmail: string;
          };
        }) => {
          const duplicate = [...identities.values()].some(
            (identity) =>
              (identity.provider === data.provider &&
                identity.providerSubject === data.providerSubject) ||
              (identity.userId === data.userId &&
                identity.provider === data.provider)
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code: "P2002",
                clientVersion: "7.8.0"
              }
            );
          }
          const now = new Date();
          const identity: AuthIdentity = {
            id: `identity-${++sequence}`,
            ...data,
            createdAt: now,
            updatedAt: now
          };
          identities.set(identity.id, identity);
          return identity;
        }
      )
    },
    workspace: {
      create: jest.fn(
        ({
          data,
          select
        }: {
          data: {
            name: string;
            slug: string;
            members: {
              create: {
                userId: string;
                role: WorkspaceRole;
              };
            };
          };
          select?: {
            members?: {
              where?: { userId?: string };
            };
          };
        }) => {
          if (
            [...workspaces.values()].some(
              (workspace) => workspace.slug === data.slug
            )
          ) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code: "P2002",
                clientVersion: "7.8.0",
                meta: { target: ["slug"] }
              }
            );
          }

          const now = new Date("2026-07-06T10:00:00.000Z");
          const workspace: StoredWorkspace = {
            id: `workspace-${++sequence}`,
            name: data.name,
            slug: data.slug,
            createdAt: now,
            updatedAt: now
          };
          const member: StoredWorkspaceMember = {
            id: `workspace-member-${++sequence}`,
            workspaceId: workspace.id,
            userId: data.members.create.userId,
            role: data.members.create.role,
            createdAt: now
          };
          workspaces.set(workspace.id, workspace);
          workspaceMembers.set(member.id, member);
          return selectedWorkspace(
            workspace,
            select?.members?.where?.userId ?? data.members.create.userId
          );
        }
      ),
      count: jest.fn(
        ({
          where
        }: {
          where?: {
            members?: { some?: { userId?: string } };
          };
        }) => {
          const userId = where?.members?.some?.userId;
          return [...workspaces.values()].filter((workspace) =>
            userId ? workspaceVisibleTo(workspace, userId) : true
          ).length;
        }
      ),
      findMany: jest.fn(
        ({
          where,
          skip = 0,
          take,
          select
        }: {
          where?: {
            members?: { some?: { userId?: string } };
          };
          skip?: number;
          take?: number;
          select?: {
            members?: {
              where?: { userId?: string };
            };
          };
        }) => {
          const userId = where?.members?.some?.userId;
          return [...workspaces.values()]
            .filter((workspace) =>
              userId ? workspaceVisibleTo(workspace, userId) : true
            )
            .sort((left, right) => {
              const updatedAtDelta =
                right.updatedAt.getTime() - left.updatedAt.getTime();
              return updatedAtDelta || left.id.localeCompare(right.id);
            })
            .slice(skip, take ? skip + take : undefined)
            .map((workspace) =>
              selectedWorkspace(workspace, select?.members?.where?.userId)
            );
        }
      ),
      findFirst: jest.fn(
        ({
          where,
          select
        }: {
          where?: {
            id?: string;
            members?: { some?: { userId?: string } };
          };
          select?: {
            members?: {
              where?: { userId?: string };
            };
          };
        }) => {
          const userId = where?.members?.some?.userId;
          const workspace = [...workspaces.values()].find(
            (candidate) =>
              (!where?.id || candidate.id === where.id) &&
              (!userId || workspaceVisibleTo(candidate, userId))
          );
          return workspace
            ? selectedWorkspace(workspace, select?.members?.where?.userId)
            : null;
        }
      )
    },
    workspaceMember: {
      count: jest.fn(
        ({
          where
        }: {
          where?: {
            workspaceId?: string;
            userId?:
              | string
              | { in?: string[]; not?: string };
            user?: {
              displayName?: {
                contains?: string;
              };
            };
          };
        }) =>
          [...workspaceMembers.values()].filter(
            (member) => {
              const user = users.get(member.userId);
              return (
                (!where?.workspaceId ||
                  member.workspaceId === where.workspaceId) &&
                (!where?.userId ||
                  (typeof where.userId === "string"
                    ? member.userId === where.userId
                    : (!where.userId.in ||
                        where.userId.in.includes(member.userId)) &&
                      (!where.userId.not ||
                        member.userId !== where.userId.not))) &&
                (!where?.user?.displayName?.contains ||
                  user?.displayName
                    .toLocaleLowerCase()
                    .includes(
                      where.user.displayName.contains.toLocaleLowerCase()
                    ))
              );
            }
          ).length
      ),
      findMany: jest.fn(
        ({
          where,
          skip = 0,
          take
        }: {
          where?: {
            workspaceId?: string;
            userId?:
              | string
              | { in?: string[]; not?: string };
            user?: {
              displayName?: {
                contains?: string;
              };
            };
          };
          skip?: number;
          take?: number;
        }) =>
          [...workspaceMembers.values()]
            .filter((member) => {
              const user = users.get(member.userId);
              return (
                (!where?.workspaceId ||
                  member.workspaceId === where.workspaceId) &&
                (!where?.userId ||
                  (typeof where.userId === "string"
                    ? member.userId === where.userId
                    : (!where.userId.in ||
                        where.userId.in.includes(member.userId)) &&
                      (!where.userId.not ||
                        member.userId !== where.userId.not))) &&
                (!where?.user?.displayName?.contains ||
                  user?.displayName
                    .toLocaleLowerCase()
                    .includes(
                      where.user.displayName.contains.toLocaleLowerCase()
                    ))
              );
            })
            .sort((left, right) => {
              if (where?.user) {
                const leftName = users.get(left.userId)?.displayName ?? "";
                const rightName = users.get(right.userId)?.displayName ?? "";
                return (
                  leftName.localeCompare(rightName) ||
                  left.userId.localeCompare(right.userId)
                );
              }
              const createdAtDelta =
                left.createdAt.getTime() - right.createdAt.getTime();
              return createdAtDelta || left.id.localeCompare(right.id);
            })
            .slice(skip, take ? skip + take : undefined)
            .map(selectedWorkspaceMember)
      ),
      findUnique: jest.fn(
        ({
          where
        }: {
          where: {
            workspaceId_userId: {
              workspaceId: string;
              userId: string;
            };
          };
        }) => {
          const identity = where.workspaceId_userId;
          const member = [...workspaceMembers.values()].find(
            (candidate) =>
              candidate.workspaceId === identity.workspaceId &&
              candidate.userId === identity.userId
          );
          return member
            ? {
                workspaceId: member.workspaceId,
                userId: member.userId,
                role: member.role
              }
            : null;
        }
      ),
      findFirst: jest.fn(
        ({
          where
        }: {
          where?: {
            id?: string;
            workspaceId?: string;
            userId?: string;
          };
        }) =>
          [...workspaceMembers.values()].find(
            (member) =>
              (!where?.id || member.id === where.id) &&
              (!where?.workspaceId ||
                member.workspaceId === where.workspaceId) &&
              (!where?.userId || member.userId === where.userId)
          ) ?? null
      ),
      create: jest.fn(
        ({
          data
        }: {
          data: {
            workspaceId: string;
            userId: string;
            role: WorkspaceRole;
          };
        }) => {
          const duplicate = [...workspaceMembers.values()].some(
            (member) =>
              member.workspaceId === data.workspaceId &&
              member.userId === data.userId
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code: "P2002",
                clientVersion: "7.8.0",
                meta: { target: ["workspaceId", "userId"] }
              }
            );
          }
          const now = new Date("2026-07-06T10:00:00.000Z");
          const member: StoredWorkspaceMember = {
            id: `workspace-member-${++sequence}`,
            workspaceId: data.workspaceId,
            userId: data.userId,
            role: data.role,
            createdAt: now
          };
          workspaceMembers.set(member.id, member);
          return selectedWorkspaceMember(member);
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: { role: WorkspaceRole };
        }) => {
          const member = workspaceMembers.get(where.id);
          if (!member) {
            throw new Error("Workspace member not found");
          }
          const updated = { ...member, role: data.role };
          workspaceMembers.set(updated.id, updated);
          return selectedWorkspaceMember(updated);
        }
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const member = workspaceMembers.get(where.id);
        if (!member) {
          throw new Error("Workspace member not found");
        }
        workspaceMembers.delete(where.id);
        return member;
      })
    },
    project: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            workspaceId: string;
            name: string;
            key: string;
          };
        }) => {
          const duplicate = [...projects.values()].some(
            (project) =>
              project.workspaceId === data.workspaceId &&
              project.key === data.key
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code: "P2002",
                clientVersion: "7.8.0",
                meta: { target: ["workspaceId", "key"] }
              }
            );
          }
          const now = new Date(
            Date.UTC(2026, 6, 30, 10, 0, 0, sequence)
          );
          const project: StoredProject = {
            id: `project-${++sequence}`,
            workspaceId: data.workspaceId,
            name: data.name,
            key: data.key,
            createdAt: now,
            updatedAt: now
          };
          projects.set(project.id, project);
          return selectedProject(project);
        }
      ),
      count: jest.fn(
        ({ where }: { where: { workspaceId: string } }) =>
          [...projects.values()].filter(
            (project) => project.workspaceId === where.workspaceId
          ).length
      ),
      findMany: jest.fn(
        ({
          where,
          skip = 0,
          take
        }: {
          where: { workspaceId: string };
          skip?: number;
          take?: number;
        }) =>
          [...projects.values()]
            .filter(
              (project) => project.workspaceId === where.workspaceId
            )
            .sort((left, right) => {
              const updatedAtDelta =
                right.updatedAt.getTime() - left.updatedAt.getTime();
              return updatedAtDelta || left.id.localeCompare(right.id);
            })
            .slice(skip, take ? skip + take : undefined)
            .map(selectedProject)
      ),
      findFirst: jest.fn(
        ({
          where
        }: {
          where: { id?: string; workspaceId: string };
        }) => {
          const project = [...projects.values()].find(
            (candidate) =>
              candidate.workspaceId === where.workspaceId &&
              (!where.id || candidate.id === where.id)
          );
          return project ? selectedProject(project) : null;
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: { name: string };
        }) => {
          const project = projects.get(where.id);
          if (!project) {
            throw new Error("Project not found");
          }
          const updated: StoredProject = {
            ...project,
            name: data.name,
            updatedAt: new Date(project.updatedAt.getTime() + 1)
          };
          projects.set(updated.id, updated);
          return selectedProject(updated);
        }
      )
    },
    task: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            projectId: string;
            creatorId: string;
            assigneeId: string | null;
            title: string;
            description: string | null;
            status: TaskStatus;
            dueDate: Date | null;
          };
        }) => {
          const now = new Date(
            Date.UTC(2026, 6, 31, 10, 0, 0, sequence)
          );
          const task: StoredTask = {
            id: `task-${++sequence}`,
            projectId: data.projectId,
            creatorId: data.creatorId,
            assigneeId: data.assigneeId,
            title: data.title,
            description: data.description,
            status: data.status,
            dueDate: data.dueDate,
            createdAt: now,
            updatedAt: now
          };
          tasks.set(task.id, task);
          return selectedTask(task);
        }
      ),
      count: jest.fn(
        ({
          where
        }: {
          where: {
            projectId: string;
            status?: TaskStatus;
            assigneeId?: string | null;
          };
        }) =>
          [...tasks.values()].filter(
            (task) =>
              task.projectId === where.projectId &&
              (!where.status || task.status === where.status) &&
              (where.assigneeId === undefined ||
                task.assigneeId === where.assigneeId)
          ).length
      ),
      findMany: jest.fn(
        ({
          where,
          skip = 0,
          take
        }: {
          where: {
            projectId: string;
            status?: TaskStatus;
            assigneeId?: string | null;
          };
          skip?: number;
          take?: number;
        }) =>
          [...tasks.values()]
            .filter(
              (task) =>
                task.projectId === where.projectId &&
                (!where.status || task.status === where.status) &&
                (where.assigneeId === undefined ||
                  task.assigneeId === where.assigneeId)
            )
            .sort((left, right) => {
              const updatedAtDelta =
                right.updatedAt.getTime() - left.updatedAt.getTime();
              return updatedAtDelta || left.id.localeCompare(right.id);
            })
            .slice(skip, take ? skip + take : undefined)
            .map(selectedTask)
      ),
      findFirst: jest.fn(
        ({
          where
        }: {
          where: {
            id: string;
            projectId: string;
          };
        }) => {
          const task = tasks.get(where.id);
          return task?.projectId === where.projectId
            ? selectedTask(task)
            : null;
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: {
            title?: string;
            description?: string | null;
            dueDate?: Date | null;
            assignee?: {
              connect?: { id: string };
              disconnect?: boolean;
            };
          };
        }) => {
          const task = tasks.get(where.id);
          if (!task) {
            throw new Error("Task not found");
          }
          const updated: StoredTask = {
            ...task,
            ...(data.title !== undefined ? { title: data.title } : {}),
            ...(data.description !== undefined
              ? { description: data.description }
              : {}),
            ...(data.dueDate !== undefined
              ? { dueDate: data.dueDate }
              : {}),
            ...(data.assignee?.connect
              ? { assigneeId: data.assignee.connect.id }
              : {}),
            ...(data.assignee?.disconnect ? { assigneeId: null } : {}),
            updatedAt: new Date(task.updatedAt.getTime() + 1)
          };
          tasks.set(updated.id, updated);
          return selectedTask(updated);
        }
      ),
      updateMany: jest.fn(
        ({
          where,
          data
        }: {
          where: {
            id?: string;
            projectId?: string;
            status?: TaskStatus;
            assigneeId?: string;
            project?: { workspaceId: string };
          };
          data: {
            status?: TaskStatus;
            assigneeId?: null;
          };
        }) => {
          let count = 0;
          for (const [id, task] of tasks) {
            const project = projects.get(task.projectId);
            if (
              (where.id && task.id !== where.id) ||
              (where.projectId && task.projectId !== where.projectId) ||
              (where.status && task.status !== where.status) ||
              (where.assigneeId && task.assigneeId !== where.assigneeId) ||
              (where.project?.workspaceId &&
                project?.workspaceId !== where.project.workspaceId)
            ) {
              continue;
            }
            tasks.set(id, {
              ...task,
              ...(data.status ? { status: data.status } : {}),
              ...(data.assigneeId === null ? { assigneeId: null } : {}),
              updatedAt: new Date(task.updatedAt.getTime() + 1)
            });
            count += 1;
          }
          return { count };
        }
      )
    },
    comment: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            taskId: string;
            authorId: string;
            body: string;
            mentions: {
              create: Array<{
                mentionedUserId: string;
                start: number;
                end: number;
              }>;
            };
          };
        }) => {
          const now = new Date(
            Date.UTC(2026, 8, 1, 10, 0, 0, sequence)
          );
          const comment: StoredComment = {
            id: `comment-${++sequence}`,
            taskId: data.taskId,
            authorId: data.authorId,
            body: data.body,
            createdAt: now
          };
          comments.set(comment.id, comment);
          for (const occurrence of data.mentions.create) {
            const mention: StoredCommentMention = {
              id: `comment-mention-${++sequence}`,
              commentId: comment.id,
              mentionedUserId: occurrence.mentionedUserId,
              start: occurrence.start,
              end: occurrence.end
            };
            commentMentions.set(mention.id, mention);
          }
          return selectedComment(comment);
        }
      ),
      findMany: jest.fn(
        ({
          where,
          take
        }: {
          where: {
            taskId: string;
            OR?: [
              { createdAt: { lt: Date } },
              { createdAt: Date; id: { lt: string } }
            ];
          };
          take: number;
        }) => {
          const cursorDate = where.OR?.[0].createdAt.lt;
          const cursorId = where.OR?.[1].id.lt;
          return [...comments.values()]
            .filter(
              (comment) =>
                comment.taskId === where.taskId &&
                (!cursorDate ||
                  comment.createdAt < cursorDate ||
                  (comment.createdAt.getTime() === cursorDate.getTime() &&
                    comment.id < (cursorId ?? "")))
            )
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id)
            )
            .slice(0, take)
            .map(selectedComment);
        }
      ),
      findFirst: jest.fn(
        ({
          where
        }: {
          where: {
            id: string;
            authorId: string;
            task: {
              id: string;
              project: { id: string; workspaceId: string };
            };
          };
        }) => {
          const comment = comments.get(where.id);
          const task = comment ? tasks.get(comment.taskId) : undefined;
          const project = task ? projects.get(task.projectId) : undefined;
          if (
            !comment ||
            !task ||
            !project ||
            comment.authorId !== where.authorId ||
            task.id !== where.task.id ||
            project.id !== where.task.project.id ||
            project.workspaceId !== where.task.project.workspaceId
          ) {
            return null;
          }
          return { id: comment.id };
        }
      )
    },
    notification: {
      createMany: jest.fn(
        ({
          data
        }: {
          data: Array<{
            type: NotificationType;
            eventVersion: number;
            recipientId: string;
            workspaceId: string;
            commentId: string;
          }>;
          skipDuplicates: boolean;
        }) => {
          let count = 0;
          for (const input of data) {
            const duplicate = [...notifications.values()].some(
              (notification) =>
                notification.recipientId === input.recipientId &&
                notification.type === input.type &&
                notification.commentId === input.commentId
            );
            if (duplicate) {
              continue;
            }
            const notification: StoredNotification = {
              id: `notification-${++sequence}`,
              ...input,
              readAt: null,
              createdAt: new Date(
                Date.UTC(2026, 8, 2, 10, 0, 0, sequence)
              )
            };
            notifications.set(notification.id, notification);
            count += 1;
          }
          return { count };
        }
      ),
      findMany: jest.fn(
        ({
          where,
          take
        }: {
          where: {
            recipientId: string;
            OR?: [
              { createdAt: { lt: Date } },
              { createdAt: Date; id: { lt: string } }
            ];
          };
          take: number;
        }) => {
          const cursorDate = where.OR?.[0].createdAt.lt;
          const cursorId = where.OR?.[1].id.lt;
          return [...notifications.values()]
            .filter(
              (notification) =>
                notificationMatchesRecipient(
                  notification,
                  where.recipientId
                ) &&
                (!cursorDate ||
                  notification.createdAt < cursorDate ||
                  (notification.createdAt.getTime() === cursorDate.getTime() &&
                    notification.id < (cursorId ?? "")))
            )
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id)
            )
            .slice(0, take)
            .map(selectedNotification);
        }
      ),
      count: jest.fn(
        ({
          where
        }: {
          where: { recipientId: string; readAt?: null };
        }) =>
          [...notifications.values()].filter(
            (notification) =>
              notificationMatchesRecipient(notification, where.recipientId) &&
              (where.readAt !== null || notification.readAt === null)
          ).length
      ),
      findFirst: jest.fn(
        ({
          where,
          select
        }: {
          where: { recipientId: string; id: string };
          select?: { id?: boolean; readAt?: boolean };
        }) => {
          const notification = notifications.get(where.id);
          if (
            !notification ||
            !notificationMatchesRecipient(notification, where.recipientId)
          ) {
            return null;
          }
          return select && Object.keys(select).length <= 2
            ? { id: notification.id, readAt: notification.readAt }
            : selectedNotification(notification);
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: { readAt: Date };
        }) => {
          const notification = notifications.get(where.id);
          if (!notification) {
            throw new Error("Notification not found");
          }
          const updated = { ...notification, readAt: data.readAt };
          notifications.set(updated.id, updated);
          return updated;
        }
      ),
      updateMany: jest.fn(
        ({
          where,
          data
        }: {
          where: {
            recipientId: string;
            readAt: null;
            createdAt: { lte: Date };
          };
          data: { readAt: Date };
        }) => {
          let count = 0;
          for (const [id, notification] of notifications) {
            if (
              !notificationMatchesRecipient(
                notification,
                where.recipientId
              ) ||
              notification.readAt !== null ||
              notification.createdAt > where.createdAt.lte
            ) {
              continue;
            }
            notifications.set(id, { ...notification, readAt: data.readAt });
            count += 1;
          }
          return { count };
        }
      ),
      deleteMany: jest.fn(
        ({
          where
        }: {
          where: { workspaceId: string; recipientId: string };
        }) => {
          let count = 0;
          for (const [id, notification] of notifications) {
            if (
              notification.workspaceId === where.workspaceId &&
              notification.recipientId === where.recipientId
            ) {
              notifications.delete(id);
              count += 1;
            }
          }
          return { count };
        }
      )
    },
    $queryRaw: jest.fn(async () => [
      { readAt: new Date("2100-01-01T00:00:00.000Z") }
    ]),
    user: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            email: string;
            displayName: string;
            passwordHash: string | null;
          };
        }) => {
          if ([...users.values()].some((user) => user.email === data.email)) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
              code: "P2002",
              clientVersion: "5.22.0",
              meta: { target: ["email"] }
              }
            );
          }

          const now = new Date("2026-06-19T10:00:00.000Z");
          const user: StoredUser = {
            id: `user-${++sequence}`,
            email: data.email,
            displayName: data.displayName,
            passwordHash: data.passwordHash,
            createdAt: now,
            updatedAt: now
          };
          users.set(user.id, user);
          return user;
        }
      ),
      findUnique: jest.fn(
        ({
          where
        }: {
          where: { id?: string; email?: string };
        }): StoredUser | null => {
          if (where.id) {
            return users.get(where.id) ?? null;
          }
          return (
            [...users.values()].find((user) => user.email === where.email) ??
            null
          );
        }
      )
    }
  };
  Object.assign(prisma, {
    $transaction: jest.fn(
      async (callback: (transaction: typeof prisma) => unknown) =>
        callback(prisma)
    )
  });

  const googleHarness = createGoogleOAuthTestHarness({
    profile: options.googleProfile,
    failure: options.googleFailure
  });
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule]
  }).overrideProvider(PrismaService).useValue(prisma);
  const rateLimitedPolicies = new Set(options.rateLimitedPolicies ?? []);
  moduleBuilder.overrideProvider(AuthRateLimiterService).useValue({
    consume: jest.fn(
      async (policy: AuthRateLimitPolicy) => {
        if (!rateLimitedPolicies.has(policy)) {
          return;
        }
        throw new HttpException(
          {
            message: "Too many authentication attempts. Please try again later.",
            code: API_ERROR_CODE.RATE_LIMITED,
            retryAfterSeconds: 60
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    ),
    consumeIp: jest.fn(
      async (policy: AuthRateLimitPolicy) => {
        if (!rateLimitedPolicies.has(policy)) {
          return;
        }
        throw new HttpException(
          {
            message: "Too many authentication attempts. Please try again later.",
            code: API_ERROR_CODE.RATE_LIMITED,
            retryAfterSeconds: 60
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    )
  });
  if (options.googleProfile || options.googleFailure) {
    moduleBuilder
      .overrideProvider(GoogleOAuthProviderService)
      .useValue(googleHarness.provider);
  }
  const moduleRef = await moduleBuilder.compile();

  const app = moduleRef.createNestApplication();
  configureApplication(app);
  await app.init();

  return {
    app,
    identities,
    users,
    sessions,
    projects,
    tasks,
    comments,
    commentMentions,
    notifications,
    workspaces,
    workspaceMembers
  };
}
