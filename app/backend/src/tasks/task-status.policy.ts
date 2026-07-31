import { TaskStatus } from "../generated/prisma/client";

const ALLOWED_TRANSITIONS: Readonly<
  Record<TaskStatus, ReadonlySet<TaskStatus>>
> = {
  [TaskStatus.BACKLOG]: new Set([
    TaskStatus.IN_PROGRESS,
    TaskStatus.CANCELED
  ]),
  [TaskStatus.IN_PROGRESS]: new Set([
    TaskStatus.DONE,
    TaskStatus.CANCELED
  ]),
  [TaskStatus.DONE]: new Set([TaskStatus.IN_PROGRESS]),
  [TaskStatus.CANCELED]: new Set()
};

export function canTransitionTaskStatus(
  current: TaskStatus,
  requested: TaskStatus
): boolean {
  return ALLOWED_TRANSITIONS[current].has(requested);
}
