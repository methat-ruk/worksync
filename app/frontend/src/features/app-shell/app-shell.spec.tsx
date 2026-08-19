import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  logoutAll: vi.fn(),
  replace: vi.fn(),
  setMode: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace })
}));

vi.mock("../auth/auth-store", () => ({
  logout: mocks.logout,
  logoutAll: mocks.logoutAll,
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "user-1",
      email: "owner@example.com",
      displayName: "Task Owner"
    }
  })
}));

vi.mock("../theme/theme-provider", () => ({
  useTheme: () => ({ mode: "system", setMode: mocks.setMode })
}));

import { AppShell } from "./app-shell";

beforeEach(() => {
  mocks.logout.mockReset();
  mocks.logoutAll.mockReset();
  mocks.replace.mockReset();
  mocks.setMode.mockReset();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false })
  });
});

describe("AppShell", () => {
  it("exposes Home as the only primary destination", () => {
    render(<AppShell>Workspace content</AppShell>);

    const homeLinks = screen.getAllByRole("link", { name: "Home" });
    expect(homeLinks.length).toBeGreaterThan(0);
    for (const link of homeLinks) {
      expect(link).toHaveAttribute("href", "/app");
      expect(link).toHaveAttribute("aria-current", "page");
    }

    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();
    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Notifications coming soon" })
    ).not.toBeInTheDocument();
  });

  it("shows accurate workspace access copy", () => {
    render(<AppShell>Workspace content</AppShell>);

    expect(screen.getAllByText("Workspace access").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Workspaces, projects, and tasks are limited by your current membership and role."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Auth secured")).not.toBeInTheDocument();
  });

  it("keeps current profile actions without advertising unavailable actions", async () => {
    const user = userEvent.setup();
    render(<AppShell>Workspace content</AppShell>);

    await user.click(screen.getByRole("button", { name: /Task Owner/ }));

    expect(await screen.findByText("Theme")).toBeVisible();
    expect(screen.getByText("Sign out", { exact: true })).toBeVisible();
    expect(screen.getByText("Sign out all devices", { exact: true })).toBeVisible();
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
    expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
  });
});
