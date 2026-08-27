import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspace, listWorkspaces } from "../api/workspaces-api";
import type {
  PublicWorkspace,
  WorkspaceListData
} from "../model/workspace-contract";
import { WorkspaceHome } from "./workspace-home";

vi.mock("../api/workspaces-api", () => ({
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn()
}));

vi.mock("@/features/projects/components/project-section", () => ({
  ProjectSection: ({ workspace }: { workspace: PublicWorkspace }) => (
    <div>Projects for {workspace.name}</div>
  )
}));

const user = {
  displayName: "Ada Lovelace"
};

const workspace: PublicWorkspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  createdAt: new Date("2026-07-08T08:00:00.000Z"),
  updatedAt: new Date("2026-07-08T08:00:00.000Z"),
  membershipRole: "OWNER"
};

const designWorkspace: PublicWorkspace = {
  ...workspace,
  id: "workspace-2",
  name: "Design Team",
  slug: "design-team",
  membershipRole: "ADMIN"
};

const operationsWorkspace: PublicWorkspace = {
  ...workspace,
  id: "workspace-3",
  name: "Operations Team",
  slug: "operations-team",
  membershipRole: "MEMBER"
};

const listWorkspacesMock = vi.mocked(listWorkspaces);
const createWorkspaceMock = vi.mocked(createWorkspace);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

describe("WorkspaceHome", () => {
  beforeEach(() => {
    listWorkspacesMock.mockReset();
    createWorkspaceMock.mockReset();
  });

  it("renders the authenticated user's workspace list", async () => {
    listWorkspacesMock.mockResolvedValue({
      items: [workspace],
      page: 1,
      pageSize: 20,
      total: 1
    });

    render(<WorkspaceHome user={user} />);

    expect((await screen.findAllByText("Product Team")).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText("OWNER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("/product-team").length).toBeGreaterThan(0);
  });

  it("creates the first workspace from the empty state", async () => {
    const actor = userEvent.setup();
    listWorkspacesMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0
    });
    createWorkspaceMock.mockResolvedValue(workspace);

    render(<WorkspaceHome user={user} />);

    expect(
      await screen.findByText("Create your first workspace")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toHaveAttribute(
      "placeholder",
      "Product Team"
    );
    await actor.type(screen.getByLabelText("Workspace name"), " Product Team ");
    await actor.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith({ name: "Product Team" });
    });
    expect((await screen.findAllByText("Product Team")).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText("Product Team is ready.")).toBeInTheDocument();
  });

  it("shows safe feedback when workspace loading fails", async () => {
    listWorkspacesMock.mockRejectedValue(new Error("boom"));

    render(<WorkspaceHome user={user} />);

    expect(
      await screen.findByText("We could not load your workspaces.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("blocks blank workspace creation before sending a request", async () => {
    const actor = userEvent.setup();
    listWorkspacesMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0
    });

    render(<WorkspaceHome user={user} />);

    await screen.findByText("Create your first workspace");
    await actor.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      await screen.findByText("Workspace name is required.")
    ).toBeInTheDocument();
    expect(createWorkspaceMock).not.toHaveBeenCalled();
  });

  it("loads and selects a workspace from a later page", async () => {
    const actor = userEvent.setup();
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockResolvedValueOnce({
        items: [operationsWorkspace],
        page: 2,
        pageSize: 2,
        total: 3
      });

    render(<WorkspaceHome user={user} />);

    expect(await screen.findByText("2 of 3 loaded")).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Load more" }));

    const operationsButton = await screen.findByRole("button", {
      name: /Operations Team/
    });
    expect(listWorkspacesMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 2
    });
    expect(screen.getByText("3 of 3 loaded")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();

    await actor.click(operationsButton);
    expect(operationsButton).toHaveAttribute("aria-pressed", "true");
  });

  it("retains the previous total when a later page reports a lower total", async () => {
    const actor = userEvent.setup();
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockResolvedValueOnce({
        items: [operationsWorkspace],
        page: 2,
        pageSize: 2,
        total: 2
      });

    render(<WorkspaceHome user={user} />);

    await screen.findByText("2 of 3 loaded");
    await actor.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Operations Team")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 loaded")).toBeInTheDocument();
  });

  it("keeps loaded workspaces visible and retries the failed page", async () => {
    const actor = userEvent.setup();
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        items: [operationsWorkspace],
        page: 2,
        pageSize: 2,
        total: 3
      });

    render(<WorkspaceHome user={user} />);

    await screen.findByText("2 of 3 loaded");
    await actor.click(screen.getByRole("button", { name: "Load more" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Product Team/ })
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 3 loaded")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();

    await actor.click(
      screen.getByRole("button", { name: "Retry load more" })
    );

    expect(await screen.findByText("Operations Team")).toBeInTheDocument();
    expect(listWorkspacesMock).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 2
    });
    expect(listWorkspacesMock).toHaveBeenNthCalledWith(3, {
      page: 2,
      pageSize: 2
    });
  });

  it("deduplicates page results and refreshes an inconsistent final page", async () => {
    const actor = userEvent.setup();
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockResolvedValueOnce({
        items: [designWorkspace],
        page: 2,
        pageSize: 2,
        total: 3
      })
      .mockResolvedValueOnce({
        items: [workspace, operationsWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      });

    render(<WorkspaceHome user={user} />);

    await screen.findByText("2 of 3 loaded");
    await actor.click(screen.getByRole("button", { name: /Design Team/ }));
    await actor.click(screen.getByRole("button", { name: "Load more" }));

    expect(
      await screen.findByText(
        "The workspace list changed while it was loading. Refresh the list to reconcile the results."
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Design Team/ })
    ).toHaveLength(1);

    await actor.click(
      screen.getByRole("button", { name: "Refresh workspaces" })
    );

    const productButton = await screen.findByRole("button", {
      name: /Product Team/
    });
    expect(productButton).toHaveAttribute("aria-pressed", "true");
    expect(listWorkspacesMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 2
    });
  });

  it("disables workspace creation while a list refresh is pending", async () => {
    const actor = userEvent.setup();
    const refreshRequest = deferred<WorkspaceListData>();
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockResolvedValueOnce({
        items: [designWorkspace],
        page: 2,
        pageSize: 2,
        total: 3
      })
      .mockReturnValueOnce(refreshRequest.promise);

    render(<WorkspaceHome user={user} />);

    await screen.findByText("2 of 3 loaded");
    await actor.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(
      "The workspace list changed while it was loading. Refresh the list to reconcile the results."
    );
    await actor.click(
      screen.getByRole("button", { name: "Refresh workspaces" })
    );

    expect(
      screen.getByRole("button", { name: "Refreshing..." })
    ).toBeDisabled();
    expect(screen.getByLabelText("Workspace name")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create workspace" })
    ).toBeDisabled();

    refreshRequest.resolve({
      items: [workspace, operationsWorkspace],
      page: 1,
      pageSize: 2,
      total: 3
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Workspace name")).toBeEnabled();
    });
  });

  it("disables list refresh while workspace creation is pending", async () => {
    const actor = userEvent.setup();
    const createRequest = deferred<PublicWorkspace>();
    const createdWorkspace: PublicWorkspace = {
      ...workspace,
      id: "workspace-4",
      name: "Research Team",
      slug: "research-team"
    };
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockResolvedValueOnce({
        items: [designWorkspace],
        page: 2,
        pageSize: 2,
        total: 3
      });
    createWorkspaceMock.mockReturnValueOnce(createRequest.promise);

    render(<WorkspaceHome user={user} />);

    await screen.findByText("2 of 3 loaded");
    await actor.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(
      "The workspace list changed while it was loading. Refresh the list to reconcile the results."
    );
    await actor.type(screen.getByLabelText("Workspace name"), "Research Team");
    await actor.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      screen.getByRole("button", { name: "Creating..." })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Refresh workspaces" })
    ).toBeDisabled();
    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);

    createRequest.resolve(createdWorkspace);

    expect(
      await screen.findByRole("button", { name: /Research Team/ })
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Refresh workspaces" })
      ).toBeEnabled();
    });
  });

  it("keeps load more available while workspace creation is pending", async () => {
    const actor = userEvent.setup();
    const createRequest = deferred<PublicWorkspace>();
    const nextPageRequest = deferred<WorkspaceListData>();
    const createdWorkspace: PublicWorkspace = {
      ...workspace,
      id: "workspace-4",
      name: "Research Team",
      slug: "research-team"
    };
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace],
        page: 1,
        pageSize: 1,
        total: 2
      })
      .mockReturnValueOnce(nextPageRequest.promise);
    createWorkspaceMock.mockReturnValueOnce(createRequest.promise);

    render(<WorkspaceHome user={user} />);

    await screen.findByText("1 of 2 loaded");
    await actor.type(screen.getByLabelText("Workspace name"), "Research Team");
    await actor.click(screen.getByRole("button", { name: "Create workspace" }));

    const loadMoreButton = screen.getByRole("button", { name: "Load more" });
    expect(loadMoreButton).toBeEnabled();
    await actor.click(loadMoreButton);

    createRequest.resolve(createdWorkspace);
    expect(
      await screen.findByRole("button", { name: /Research Team/ })
    ).toHaveAttribute("aria-pressed", "true");

    nextPageRequest.resolve({
      items: [designWorkspace],
      page: 2,
      pageSize: 1,
      total: 2
    });

    expect(await screen.findByText("Design Team")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Research Team/ })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 of 3 loaded")).toBeInTheDocument();
  });

  it("prevents duplicate page requests while loading", async () => {
    const actor = userEvent.setup();
    let resolveNextPage:
      | ((data: {
          items: PublicWorkspace[];
          page: number;
          pageSize: number;
          total: number;
        }) => void)
      | undefined;
    const nextPage = new Promise<{
      items: PublicWorkspace[];
      page: number;
      pageSize: number;
      total: number;
    }>((resolve) => {
      resolveNextPage = resolve;
    });

    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace, designWorkspace],
        page: 1,
        pageSize: 2,
        total: 3
      })
      .mockReturnValueOnce(nextPage);

    render(<WorkspaceHome user={user} />);

    await screen.findByText("2 of 3 loaded");
    const loadMoreButton = screen.getByRole("button", { name: "Load more" });
    await actor.dblClick(loadMoreButton);

    expect(listWorkspacesMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "Loading..." })
    ).toBeDisabled();

    resolveNextPage?.({
      items: [operationsWorkspace],
      page: 2,
      pageSize: 2,
      total: 3
    });
    expect(await screen.findByText("Operations Team")).toBeInTheDocument();
  });

  it("keeps accumulated workspaces and selects a newly created workspace", async () => {
    const actor = userEvent.setup();
    const createdWorkspace: PublicWorkspace = {
      ...workspace,
      id: "workspace-4",
      name: "Research Team",
      slug: "research-team"
    };
    listWorkspacesMock
      .mockResolvedValueOnce({
        items: [workspace],
        page: 1,
        pageSize: 1,
        total: 2
      })
      .mockResolvedValueOnce({
        items: [designWorkspace],
        page: 2,
        pageSize: 1,
        total: 2
      });
    createWorkspaceMock.mockResolvedValue(createdWorkspace);

    render(<WorkspaceHome user={user} />);

    await screen.findByText("1 of 2 loaded");
    await actor.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Design Team");
    await actor.type(screen.getByLabelText("Workspace name"), "Research Team");
    await actor.click(screen.getByRole("button", { name: "Create workspace" }));

    const researchButton = await screen.findByRole("button", {
      name: /Research Team/
    });
    expect(researchButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 total")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 loaded")).toBeInTheDocument();
    expect(screen.getByText("Product Team")).toBeInTheDocument();
    expect(screen.getByText("Design Team")).toBeInTheDocument();
  });
});
