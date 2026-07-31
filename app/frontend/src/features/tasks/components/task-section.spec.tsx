import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import type { PublicProject } from "@/features/projects/model/project-contract";
import type { PublicWorkspace } from "@/features/workspaces/model/workspace-contract";
import {
  createTask,
  listTasks,
  searchTaskAssignees,
  transitionTaskStatus,
  updateTask
} from "../api/tasks-api";
import type {
  PublicTask,
  PublicTaskUser,
  TaskListData
} from "../model/task-contract";
import { AssigneePicker, TaskSection } from "./task-section";

vi.mock("../api/tasks-api", () => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
  searchTaskAssignees: vi.fn(),
  transitionTaskStatus: vi.fn(),
  updateTask: vi.fn()
}));

const workspace: PublicWorkspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  membershipRole: "OWNER",
  createdAt: new Date("2026-07-31T08:00:00.000Z"),
  updatedAt: new Date("2026-07-31T08:00:00.000Z")
};

const project: PublicProject = {
  id: "project-1",
  name: "WorkSync",
  key: "WSYNC",
  createdAt: new Date("2026-07-31T08:00:00.000Z"),
  updatedAt: new Date("2026-07-31T08:00:00.000Z")
};

const task: PublicTask = {
  id: "task-1",
  projectId: project.id,
  title: "Ship task flow",
  description: "Finish the reviewed task workflow.",
  status: "BACKLOG",
  dueDate: null,
  creator: { id: "owner-1", displayName: "Owner" },
  assignee: null,
  createdAt: new Date("2026-07-31T10:00:00.000Z"),
  updatedAt: new Date("2026-07-31T10:00:00.000Z")
};

function page(items: PublicTask[], total = items.length): TaskListData {
  return {
    items,
    page: 1,
    pageSize: 20,
    total
  };
}

describe("TaskSection", () => {
  beforeEach(() => {
    vi.mocked(createTask).mockReset();
    vi.mocked(listTasks).mockReset();
    vi.mocked(searchTaskAssignees).mockReset();
    vi.mocked(transitionTaskStatus).mockReset();
    vi.mocked(updateTask).mockReset();
    vi.mocked(searchTaskAssignees).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the selected project task workflow", async () => {
    vi.mocked(listTasks).mockResolvedValue(page([task]));

    render(<TaskSection project={project} workspace={workspace} />);

    expect(await screen.findByText(task.title)).toBeInTheDocument();
    expect(screen.getAllByText("Backlog")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Create task" })
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("keeps viewers read-only", async () => {
    vi.mocked(listTasks).mockResolvedValue(page([task]));

    render(
      <TaskSection
        project={project}
        workspace={{ ...workspace, membershipRole: "VIEWER" }}
      />
    );

    expect(await screen.findByText(task.title)).toBeInTheDocument();
    expect(screen.getByText(/VIEWER role is read-only/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create task" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start" })
    ).not.toBeInTheDocument();
  });

  it("requires confirmation before terminal cancellation", async () => {
    const user = userEvent.setup();
    vi.mocked(listTasks).mockResolvedValue(page([task]));
    vi.mocked(transitionTaskStatus).mockResolvedValue({
      ...task,
      status: "CANCELED"
    });

    render(<TaskSection project={project} workspace={workspace} />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(
      screen.getByText(/cannot be reopened after it is canceled/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep task" }));
    expect(transitionTaskStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Cancel task" }));
    await waitFor(() =>
      expect(transitionTaskStatus).toHaveBeenCalledWith(
        workspace.id,
        project.id,
        task.id,
        "CANCELED",
        expect.any(AbortSignal)
      )
    );
  });

  it("clears the load-more pending state when a filter reload aborts it", async () => {
    const user = userEvent.setup();
    let loadMoreSignal: AbortSignal | undefined;
    vi.mocked(listTasks).mockImplementation(
      (_workspaceId, _projectId, options) => {
        if (options?.page === 2) {
          loadMoreSignal = options.signal;
          return new Promise((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () =>
                reject(
                  new DOMException("The request was aborted.", "AbortError")
                ),
              { once: true }
            );
          });
        }
        return Promise.resolve(page([task], 2));
      }
    );

    render(<TaskSection project={project} workspace={workspace} />);

    const loadMoreButton = await screen.findByRole("button", {
      name: "Load more tasks"
    });
    await user.click(loadMoreButton);
    expect(
      screen.getByRole("button", { name: "Loading..." })
    ).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Status filter" }),
      "IN_PROGRESS"
    );

    await waitFor(() => expect(loadMoreSignal?.aborted).toBe(true));
    expect(
      await screen.findByRole("button", { name: "Load more tasks" })
    ).toBeEnabled();
  });
});

describe("AssigneePicker auto-search", () => {
  beforeEach(() => {
    vi.mocked(searchTaskAssignees).mockReset();
    vi.mocked(searchTaskAssignees).mockResolvedValue({
      items: [{ id: "user-1", displayName: "Alice Example" }],
      page: 1,
      pageSize: 20,
      total: 1
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads initial candidates and debounces settled input", async () => {
    vi.useFakeTimers();
    render(
      <AssigneePicker
        onSelect={vi.fn()}
        selected={null}
        workspaceId={workspace.id}
      />
    );
    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await vi.runOnlyPendingTimersAsync();
    expect(searchTaskAssignees).toHaveBeenCalledWith(
      workspace.id,
      expect.objectContaining({ search: "", page: 1, pageSize: 20 })
    );

    fireEvent.change(input, { target: { value: "Ali" } });
    await vi.advanceTimersByTimeAsync(299);
    expect(searchTaskAssignees).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(searchTaskAssignees).toHaveBeenLastCalledWith(
      workspace.id,
      expect.objectContaining({ search: "Ali", page: 1 })
    );
  });

  it("waits for IME compositionend before searching", async () => {
    vi.useFakeTimers();
    render(
      <AssigneePicker
        onSelect={vi.fn()}
        selected={null}
        workspaceId={workspace.id}
      />
    );
    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await vi.runOnlyPendingTimersAsync();
    vi.mocked(searchTaskAssignees).mockClear();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "อลิ" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(searchTaskAssignees).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { data: "อลิ" });
    await vi.advanceTimersByTimeAsync(300);
    expect(searchTaskAssignees).toHaveBeenCalledWith(
      workspace.id,
      expect.objectContaining({ search: "อลิ" })
    );
  });

  it("aborts an in-flight search when IME composition starts", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.mocked(searchTaskAssignees).mockImplementation(
      (_workspaceId, options) =>
        new Promise((resolve) => {
          requestSignal = options?.signal;
          options?.signal?.addEventListener(
            "abort",
            () =>
              resolve({
                items: [],
                page: 1,
                pageSize: 20,
                total: 0
              }),
            { once: true }
          );
        })
    );
    render(
      <AssigneePicker
        onSelect={vi.fn()}
        selected={null}
        workspaceId={workspace.id}
      />
    );
    const input = screen.getByRole("combobox", { name: "Assignee" });

    fireEvent.focus(input);
    await vi.runOnlyPendingTimersAsync();
    expect(requestSignal?.aborted).toBe(false);

    fireEvent.compositionStart(input);
    expect(requestSignal?.aborted).toBe(true);
  });

  it("visually tracks keyboard navigation and selects the active candidate", async () => {
    vi.useFakeTimers();
    const candidates: PublicTaskUser[] = [
      { id: "user-1", displayName: "Alice Example" },
      { id: "user-2", displayName: "Bob Example" }
    ];
    const onSelect = vi.fn();
    vi.mocked(searchTaskAssignees).mockResolvedValue({
      items: candidates,
      page: 1,
      pageSize: 20,
      total: candidates.length
    });

    render(
      <AssigneePicker
        onSelect={onSelect}
        selected={null}
        workspaceId={workspace.id}
      />
    );
    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const alice = screen.getByRole("option", {
      name: /Alice Example/
    });
    const bob = screen.getByRole("option", { name: /Bob Example/ });
    expect(alice).toHaveClass("bg-muted");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(alice).not.toHaveClass("bg-muted");
    expect(bob).toHaveClass("bg-muted");
    expect(input).toHaveAttribute("aria-activedescendant", bob.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(candidates[1]);
    expect(
      screen.queryByRole("listbox", { name: "Assignee candidates" })
    ).not.toBeInTheDocument();
  });
});
