import {
  TaskStatus,
  WorkspaceRole
} from "../../src/generated/prisma/client";
import {
  canMutateTask,
  canReadTask
} from "../../src/tasks/task-rbac.policy";
import { canTransitionTaskStatus } from "../../src/tasks/task-status.policy";

describe("task policies", () => {
  it.each([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER
  ])("allows %s to read tasks", (role) => {
    expect(canReadTask(role)).toBe(true);
  });

  it.each([
    [WorkspaceRole.OWNER, true],
    [WorkspaceRole.ADMIN, true],
    [WorkspaceRole.MEMBER, true],
    [WorkspaceRole.VIEWER, false]
  ])("maps %s task mutation permission", (role, expected) => {
    expect(canMutateTask(role)).toBe(expected);
  });

  it.each([
    [TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS, true],
    [TaskStatus.BACKLOG, TaskStatus.CANCELED, true],
    [TaskStatus.IN_PROGRESS, TaskStatus.DONE, true],
    [TaskStatus.IN_PROGRESS, TaskStatus.CANCELED, true],
    [TaskStatus.DONE, TaskStatus.IN_PROGRESS, true],
    [TaskStatus.BACKLOG, TaskStatus.DONE, false],
    [TaskStatus.DONE, TaskStatus.CANCELED, false],
    [TaskStatus.CANCELED, TaskStatus.BACKLOG, false],
    [TaskStatus.CANCELED, TaskStatus.IN_PROGRESS, false],
    [TaskStatus.CANCELED, TaskStatus.DONE, false],
    [TaskStatus.BACKLOG, TaskStatus.BACKLOG, false]
  ])(
    "maps %s -> %s to %s",
    (current, requested, expected) => {
      expect(canTransitionTaskStatus(current, requested)).toBe(expected);
    }
  );
});
