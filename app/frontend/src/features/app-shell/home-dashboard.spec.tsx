import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeDashboard } from "./home-dashboard";
import { createWorkspace, listWorkspaces } from "../workspaces/api-client";
import type { PublicWorkspace } from "../workspaces/workspace-contract";

vi.mock("../workspaces/api-client", () => ({
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn()
}));

const user = {
  id: "user-1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  createdAt: new Date("2026-06-23T00:00:00.000Z"),
  updatedAt: new Date("2026-06-23T00:00:00.000Z")
};

const workspace: PublicWorkspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  createdAt: new Date("2026-07-08T08:00:00.000Z"),
  updatedAt: new Date("2026-07-08T08:00:00.000Z"),
  membershipRole: "OWNER"
};

const listWorkspacesMock = vi.mocked(listWorkspaces);
const createWorkspaceMock = vi.mocked(createWorkspace);

describe("HomeDashboard", () => {
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

    render(<HomeDashboard user={user} />);

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

    render(<HomeDashboard user={user} />);

    expect(
      await screen.findByText("Create your first workspace")
    ).toBeInTheDocument();
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

    render(<HomeDashboard user={user} />);

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

    render(<HomeDashboard user={user} />);

    await screen.findByText("Create your first workspace");
    await actor.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      await screen.findByText("Workspace name is required.")
    ).toBeInTheDocument();
    expect(createWorkspaceMock).not.toHaveBeenCalled();
  });
});
