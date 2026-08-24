"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import { createTask, updateTask } from "../api/tasks-api";
import {
  createTaskInputSchema,
  type PublicTask,
  type PublicTaskUser
} from "../model/task-contract";
import {
  isTaskAbortError,
  taskErrorMessage
} from "../model/task-error-message";
import { AssigneePicker } from "./assignee-picker";

function dateTimeLocalValue(value: Date | null): string {
  if (!value) {
    return "";
  }
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function TaskFormSheet({
  open,
  workspaceId,
  projectId,
  task,
  returnFocusRef,
  successFocusRef,
  onOpenChange,
  onSaved
}: {
  open: boolean;
  workspaceId: string;
  projectId: string;
  task: PublicTask | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  successFocusRef: RefObject<HTMLElement | null>;
  onOpenChange: (open: boolean) => void;
  onSaved: (task: PublicTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<PublicTaskUser | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const savedSuccessfullyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const titleId = useId();
  const titleErrorId = `${titleId}-error`;

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setDueDate(dateTimeLocalValue(task?.dueDate ?? null));
    setAssignee(task?.assignee ?? null);
    setTitleError(null);
    setRequestError(null);
    savedSuccessfullyRef.current = false;
  }, [open, task]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) {
      return;
    }
    const input = {
      title,
      description: description || null,
      assigneeId: assignee?.id ?? null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null
    };
    const parsed = createTaskInputSchema.safeParse(input);
    if (!parsed.success) {
      setTitleError(parsed.error.flatten().fieldErrors.title?.[0] ?? null);
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setTitleError(null);
    setRequestError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const saved = task
        ? await updateTask(
            workspaceId,
            projectId,
            task.id,
            parsed.data,
            controller.signal
          )
        : await createTask(
            workspaceId,
            projectId,
            parsed.data,
            controller.signal
          );
      savedSuccessfullyRef.current = true;
      onSaved(saved);
      onOpenChange(false);
    } catch (error: unknown) {
      if (!controller.signal.aborted && !isTaskAbortError(error)) {
        setRequestError(taskErrorMessage(error));
      }
    } finally {
      if (!controller.signal.aborted) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-lg"
        finalFocus={() =>
          savedSuccessfullyRef.current
            ? successFocusRef.current
            : returnFocusRef.current
        }
      >
        <SheetHeader>
          <SheetTitle>{task ? "Edit task" : "Create task"}</SheetTitle>
          <SheetDescription>
            {task
              ? "Update task details without changing its creator or project."
              : "Add a task to this project. New tasks start in Backlog."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col gap-5 px-4 pb-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                aria-errormessage={titleError ? titleErrorId : undefined}
                aria-invalid={Boolean(titleError)}
                disabled={pending}
                id={titleId}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
              <FieldError id={titleErrorId}>{titleError}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${titleId}-description`}>
                Description
              </FieldLabel>
              <Textarea
                disabled={pending}
                id={`${titleId}-description`}
                maxLength={5000}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                value={description}
              />
              <FieldDescription>
                Optional, up to 5,000 characters.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${titleId}-due-date`}>
                Due date
              </FieldLabel>
              <Input
                disabled={pending}
                id={`${titleId}-due-date`}
                onChange={(event) => setDueDate(event.target.value)}
                type="datetime-local"
                value={dueDate}
              />
            </Field>
            <Field>
              <AssigneePicker
                onSelect={setAssignee}
                selected={assignee}
                workspaceId={workspaceId}
              />
            </Field>
          </FieldGroup>
          {requestError && (
            <Alert variant="destructive">
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          )}
          <div className="mt-auto flex justify-end gap-2">
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "Saving..." : task ? "Save task" : "Create task"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
