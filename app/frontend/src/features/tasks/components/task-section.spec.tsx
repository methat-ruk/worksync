import {
  act,
  fireEvent,
  render,
  screen,
  within,
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
  TaskAssigneeListData,
  TaskListData
} from "../model/task-contract";
import { AssigneePicker } from "./assignee-picker";
import { TaskSection } from "./task-section";

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

function page(
  items: PublicTask[],
  total = items.length,
  pageNumber = 1,
  pageSize = 20
): TaskListData {
  return {
    items,
    page: pageNumber,
    pageSize,
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

  it("creates a task through the existing form contract", async () => {
    const user = userEvent.setup();
    const createdTask = {
      ...task,
      id: "task-2",
      title: "Create characterization"
    };
    let resolveRefresh!: (value: TaskListData) => void;
    vi.mocked(listTasks)
      .mockResolvedValueOnce(page([]))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRefresh = resolve;
        })
      );
    vi.mocked(createTask).mockResolvedValue(createdTask);

    render(<TaskSection project={project} workspace={workspace} />);

    const createButton = await screen.findByRole("button", {
      name: "Create task"
    });
    await user.click(createButton);
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), createdTask.title);
    await user.click(
      within(dialog).getByRole("button", { name: "Create task" })
    );

    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        workspace.id,
        project.id,
        expect.objectContaining({ title: createdTask.title }),
        expect.any(AbortSignal)
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(createButton);
    expect(screen.getByText("No matching tasks")).toBeVisible();

    resolveRefresh(page([createdTask]));
    expect(await screen.findByText(createdTask.title)).toBeVisible();
  });

  it("submits edits through the existing task update contract", async () => {
    const user = userEvent.setup();
    const updatedTask = { ...task, title: "Updated task title" };
    vi.mocked(listTasks).mockResolvedValue(page([task]));
    vi.mocked(updateTask).mockResolvedValue(updatedTask);

    render(<TaskSection project={project} workspace={workspace} />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, updatedTask.title);
    await user.click(within(dialog).getByRole("button", { name: "Save task" }));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        workspace.id,
        project.id,
        task.id,
        expect.objectContaining({ title: updatedTask.title }),
        expect.any(AbortSignal)
      )
    );
  });

  it("reloads the task list with the selected status filter", async () => {
    const user = userEvent.setup();
    vi.mocked(listTasks).mockResolvedValue(page([task]));

    render(<TaskSection project={project} workspace={workspace} />);

    await screen.findByText(task.title);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Status filter" }),
      "IN_PROGRESS"
    );

    await waitFor(() =>
      expect(listTasks).toHaveBeenLastCalledWith(
        workspace.id,
        project.id,
        expect.objectContaining({ status: "IN_PROGRESS" })
      )
    );
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
        return Promise.resolve(page([task], 2, 1, 1));
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

  it("offers reconciliation when a later page only repeats loaded tasks", async () => {
    const user = userEvent.setup();
    vi.mocked(listTasks).mockImplementation(
      (_workspaceId, _projectId, options) =>
        Promise.resolve(
          options?.page === 2
            ? page([task], 2, 2, 1)
            : page([task], 2, 1, 1)
        )
    );

    render(<TaskSection project={project} workspace={workspace} />);

    await user.click(
      await screen.findByRole("button", { name: "Load more tasks" })
    );

    expect(
      await screen.findByText(/task list changed while it was loading/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh tasks" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Load more tasks" })
    ).not.toBeInTheDocument();
  });

  it("offers reconciliation when the final covered page is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(listTasks).mockImplementation(
      (_workspaceId, _projectId, options) =>
        Promise.resolve(
          options?.page === 2
            ? page([], 2, 2, 1)
            : page([task], 2, 1, 1)
        )
    );

    render(<TaskSection project={project} workspace={workspace} />);

    await user.click(
      await screen.findByRole("button", { name: "Load more tasks" })
    );

    expect(
      await screen.findByRole("button", { name: "Refresh tasks" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Load more tasks" })
    ).not.toBeInTheDocument();
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

  it("only exposes mounted combobox relationships across closed and loading states", async () => {
    vi.useFakeTimers();
    vi.mocked(searchTaskAssignees).mockReturnValue(new Promise(() => {}));

    render(
      <AssigneePicker
        onSelect={vi.fn()}
        selected={null}
        workspaceId={workspace.id}
      />
    );

    const input = screen.getByRole("combobox", { name: "Assignee" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(input);
    await vi.runOnlyPendingTimersAsync();

    const listbox = screen.getByRole("listbox", {
      name: "Assignee candidates"
    });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(listbox).toHaveAttribute("aria-busy", "true");
  });

  it("keeps the listbox mounted for empty and error results", async () => {
    vi.useFakeTimers();
    vi.mocked(searchTaskAssignees)
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0
      })
      .mockRejectedValueOnce(new Error("search failed"));

    render(
      <AssigneePicker
        onSelect={vi.fn()}
        selected={null}
        workspaceId={workspace.id}
      />
    );

    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText(/No matching workspace members/)).toBeVisible();

    fireEvent.change(input, { target: { value: "missing" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry search" })).toBeEnabled();
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("prevents Enter from submitting a parent form when reopening", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <AssigneePicker
          onSelect={vi.fn()}
          selected={null}
          workspaceId={workspace.id}
        />
      </form>
    );

    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prevents Enter from submitting while open without an active option", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    vi.mocked(searchTaskAssignees).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0
    });
    render(
      <form onSubmit={onSubmit}>
        <AssigneePicker
          onSelect={vi.fn()}
          selected={null}
          workspaceId={workspace.id}
        />
      </form>
    );

    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("only consumes Escape while the candidate popup is open", async () => {
    vi.useFakeTimers();
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <AssigneePicker
          onSelect={vi.fn()}
          selected={null}
          workspaceId={workspace.id}
        />
      </div>
    );

    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("keeps virtual options out of the Tab order and closes when focus leaves", async () => {
    vi.useFakeTimers();
    render(
      <div>
        <AssigneePicker
          onSelect={vi.fn()}
          selected={null}
          workspaceId={workspace.id}
        />
        <button type="button">After picker</button>
      </div>
    );

    const input = screen.getByRole("combobox", { name: "Assignee" });
    fireEvent.focus(input);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByRole("option", { name: /Alice Example/ })).toHaveAttribute(
      "tabindex",
      "-1"
    );
    fireEvent.blur(input, {
      relatedTarget: screen.getByRole("button", { name: "After picker" })
    });

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
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

  it("invalidates stale candidates as soon as the query changes", async () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const initialCandidates = Array.from({ length: 20 }, (_, index) => ({
      id: `user-${index + 1}`,
      displayName: index === 0 ? "Alice Example" : `Candidate ${index + 1}`
    }));
    let staleRequestSignal: AbortSignal | undefined;
    let resolveStaleRequest!: (value: TaskAssigneeListData) => void;
    vi.mocked(searchTaskAssignees).mockImplementation(
      (_workspaceId, options) => {
        if (options?.page === 2) {
          staleRequestSignal = options.signal;
          return new Promise((resolve) => {
            resolveStaleRequest = resolve;
          });
        }
        if (options?.search === "Bob") {
          return Promise.resolve({
            items: [{ id: "user-2", displayName: "Bob Example" }],
            page: 1,
            pageSize: 20,
            total: 1
          });
        }
        return Promise.resolve({
          items: initialCandidates,
          page: 1,
          pageSize: 20,
          total: 21
        });
      }
    );

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
    expect(
      screen.getByRole("option", { name: /Alice Example/ })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(staleRequestSignal?.aborted).toBe(false);

    fireEvent.change(input, { target: { value: "Bob" } });
    expect(staleRequestSignal?.aborted).toBe(true);
    expect(
      screen.queryByRole("option", { name: /Alice Example/ })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();

    await act(async () => {
      resolveStaleRequest({
        items: [{ id: "user-3", displayName: "Stale Example" }],
        page: 2,
        pageSize: 20,
        total: 21
      });
      await Promise.resolve();
    });
    expect(
      screen.queryByRole("option", { name: /Stale Example/ })
    ).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(
      screen.getByRole("option", { name: /Bob Example/ })
    ).toBeInTheDocument();
  });

  it("offers reconciliation when a later candidate page repeats a user", async () => {
    vi.useFakeTimers();
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      id: `user-${index + 1}`,
      displayName: `Candidate ${index + 1}`
    }));
    vi.mocked(searchTaskAssignees).mockImplementation(
      (_workspaceId, options) =>
        Promise.resolve(
          options?.page === 2
            ? {
                items: [firstPage[19]!],
                page: 2,
                pageSize: 20,
                total: 21
              }
            : {
                items: firstPage,
                page: 1,
                pageSize: 20,
                total: 21
              }
        )
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
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await Promise.resolve();
    });

    expect(
      screen.getByText(/assignee list changed while it was loading/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh candidates" })
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(searchTaskAssignees).toHaveBeenLastCalledWith(
      workspace.id,
      expect.objectContaining({ page: 1, search: "" })
    );
    expect(
      screen.queryByText(/assignee list changed while it was loading/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
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
