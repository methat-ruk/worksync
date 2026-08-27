import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicWorkspace } from "@/features/workspaces/model/workspace-contract";
import { createProject, listProjects } from "../api/projects-api";
import type {
  ProjectListData,
  PublicProject
} from "../model/project-contract";
import { ProjectSection } from "./project-section";

vi.mock("../api/projects-api", () => ({
  createProject: vi.fn(),
  listProjects: vi.fn()
}));

vi.mock("@/features/tasks/components/task-section", () => ({
  TaskSection: ({ project }: { project: PublicProject }) => (
    <div>Tasks for {project.name}</div>
  )
}));

const workspace: PublicWorkspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  createdAt: new Date("2026-07-08T08:00:00.000Z"),
  updatedAt: new Date("2026-07-08T08:00:00.000Z"),
  membershipRole: "OWNER"
};

const project: PublicProject = {
  id: "project-1",
  name: "WorkSync",
  key: "WSYNC",
  createdAt: new Date("2026-07-30T08:00:00.000Z"),
  updatedAt: new Date("2026-07-30T08:00:00.000Z")
};

function projectPage(
  items: PublicProject[],
  overrides: Partial<ProjectListData> = {}
): ProjectListData {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    ...overrides
  };
}

describe("ProjectSection", () => {
  beforeEach(() => {
    vi.mocked(createProject).mockReset();
    vi.mocked(listProjects).mockReset();
  });

  it("announces the initial loading state", () => {
    vi.mocked(listProjects).mockImplementation(
      () => new Promise(() => undefined)
    );

    render(<ProjectSection workspace={workspace} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading projects..."
    );
    expect(
      screen.getByRole("region", { name: `Projects in ${workspace.name}` })
    ).toHaveAttribute("aria-busy", "true");
  });

  it("renders the empty state and creates a normalized project once", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: PublicProject) => void) | undefined;
    vi.mocked(listProjects).mockResolvedValue(projectPage([]));
    vi.mocked(createProject).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    render(<ProjectSection workspace={workspace} />);
    expect(
      await screen.findByText("No projects in this workspace")
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Project name"), " WorkSync ");
    await user.type(screen.getByLabelText("Project key"), "wsync");
    const button = screen.getByRole("button", { name: "Create project" });
    await user.dblClick(button);

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject).toHaveBeenCalledWith(
      workspace.id,
      { name: "WorkSync", key: "WSYNC" },
      expect.any(AbortSignal)
    );
    resolveCreate?.(project);

    expect(await screen.findByText("WorkSync is ready.")).toBeInTheDocument();
    expect(screen.getByText("WSYNC")).toBeInTheDocument();
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("associates validation feedback only with the invalid field", async () => {
    const user = userEvent.setup();
    vi.mocked(listProjects).mockResolvedValue(projectPage([]));

    render(<ProjectSection workspace={workspace} />);
    await screen.findByText("No projects in this workspace");
    await user.type(screen.getByLabelText("Project key"), "wsync");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(screen.getByText("Project name is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(
      screen.getByLabelText("Project name")
    ).toHaveAccessibleDescription("Project name is required.");
    expect(screen.getByLabelText("Project key")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it("recovers from an initial project-list failure", async () => {
    const user = userEvent.setup();
    vi.mocked(listProjects)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(projectPage([]));

    render(<ProjectSection workspace={workspace} />);

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Retry projects" })
    );

    expect(
      await screen.findByText("No projects in this workspace")
    ).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(2);
  });

  it("exits pending state and retries after project creation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(listProjects).mockResolvedValue(projectPage([]));
    vi.mocked(createProject)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(project);

    render(<ProjectSection workspace={workspace} />);
    await screen.findByText("No projects in this workspace");
    await user.type(screen.getByLabelText("Project name"), "WorkSync");
    await user.type(screen.getByLabelText("Project key"), "wsync");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    const retryButton = screen.getByRole("button", {
      name: "Create project"
    });
    expect(retryButton).toBeEnabled();
    await user.click(retryButton);

    expect(await screen.findByText("WorkSync is ready.")).toBeInTheDocument();
    expect(createProject).toHaveBeenCalledTimes(2);
  });

  it("keeps viewers read-only while rendering projects", async () => {
    vi.mocked(listProjects).mockResolvedValue(projectPage([project]));
    render(
      <ProjectSection
        workspace={{ ...workspace, membershipRole: "VIEWER" }}
      />
    );

    expect(await screen.findByText("WorkSync")).toBeInTheDocument();
    expect(
      screen.getByText(/Your VIEWER role is read-only/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create project" })
    ).not.toBeInTheDocument();
  });

  it("does not render a late result from the previously selected workspace", async () => {
    let resolveFirst: ((value: ProjectListData) => void) | undefined;
    let resolveSecond: ((value: ProjectListData) => void) | undefined;
    vi.mocked(listProjects)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );

    const { rerender } = render(<ProjectSection workspace={workspace} />);
    const designWorkspace = {
      ...workspace,
      id: "workspace-2",
      name: "Design Team"
    };
    rerender(<ProjectSection workspace={designWorkspace} />);

    resolveSecond?.(
      projectPage([{ ...project, id: "project-2", name: "Design System" }])
    );
    expect(await screen.findByText("Design System")).toBeInTheDocument();

    resolveFirst?.(projectPage([project]));
    await waitFor(() => {
      expect(screen.queryByText("WorkSync")).not.toBeInTheDocument();
    });
    expect(listProjects).toHaveBeenNthCalledWith(
      2,
      designWorkspace.id,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("loads later pages without duplicating projects", async () => {
    const user = userEvent.setup();
    vi.mocked(listProjects)
      .mockResolvedValueOnce(
        projectPage([project], { page: 1, pageSize: 1, total: 2 })
      )
      .mockResolvedValueOnce(
        projectPage(
          [{ ...project, id: "project-2", name: "Platform" }],
          { page: 2, pageSize: 1, total: 2 }
        )
      );

    render(<ProjectSection workspace={workspace} />);
    await user.click(
      await screen.findByRole("button", { name: "Load more projects" })
    );

    expect(await screen.findByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 loaded")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more projects" })
    ).not.toBeInTheDocument();
  });

  it("offers reconciliation when a reordered terminal page overlaps earlier results", async () => {
    const user = userEvent.setup();
    const secondProject = {
      ...project,
      id: "project-2",
      name: "Platform"
    };
    vi.mocked(listProjects)
      .mockResolvedValueOnce(
        projectPage([project], { page: 1, pageSize: 1, total: 2 })
      )
      .mockResolvedValueOnce(
        projectPage(
          [{ ...project, name: "WorkSync Updated" }],
          { page: 2, pageSize: 1, total: 2 }
        )
      )
      .mockResolvedValueOnce(projectPage([project, secondProject]));

    render(<ProjectSection workspace={workspace} />);
    await user.click(
      await screen.findByRole("button", { name: "Load more projects" })
    );

    expect(screen.getByText("1 of 2 loaded")).toBeInTheDocument();
    expect(screen.getByText("WorkSync Updated")).toBeInTheDocument();
    expect(screen.queryByText("WorkSync")).not.toBeInTheDocument();
    expect(
      screen.getByText(/The project list changed while it was loading/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more projects" })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Refresh projects" })
    );

    expect(await screen.findByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 loaded")).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(3);
  });

  it("recovers after loading a later page fails", async () => {
    const user = userEvent.setup();
    vi.mocked(listProjects)
      .mockResolvedValueOnce(
        projectPage([project], { page: 1, pageSize: 1, total: 2 })
      )
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(
        projectPage(
          [{ ...project, id: "project-2", name: "Platform" }],
          { page: 2, pageSize: 1, total: 2 }
        )
      );

    render(<ProjectSection workspace={workspace} />);
    await user.click(
      await screen.findByRole("button", { name: "Load more projects" })
    );

    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Retry load more" })
    );

    expect(await screen.findByText("Platform")).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(3);
  });
});
