import { render, screen, within } from "@testing-library/react";
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
  it("exposes only Home in primary navigation while workflow labels remain in content", () => {
    render(
      <AppShell>
        <p>Workspaces</p>
        <p>Projects</p>
        <p>Tasks</p>
      </AppShell>
    );

    const primaryNavigations = screen.getAllByRole("navigation", {
      name: "Primary"
    });
    expect(primaryNavigations.length).toBeGreaterThan(0);
    for (const primaryNavigation of primaryNavigations) {
      const links = within(primaryNavigation).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName("Home");
      expect(links[0]).toHaveAttribute("href", "/app");
      expect(links[0]).toHaveAttribute("aria-current", "page");
    }

    const header = screen.getByRole("banner");
    expect(
      within(header).queryByRole("button", {
        name: "Notifications coming soon"
      })
    ).not.toBeInTheDocument();
  });

  it("shows accurate workspace access copy", () => {
    render(<AppShell>Workspace content</AppShell>);

    const primaryNavigations = screen.getAllByRole("navigation", {
      name: "Primary"
    });
    for (const primaryNavigation of primaryNavigations) {
      const sidebar = primaryNavigation.parentElement;
      expect(sidebar).not.toBeNull();
      const sidebarQueries = within(sidebar as HTMLElement);
      expect(sidebarQueries.getByText("Workspace access")).toBeVisible();
      expect(
        sidebarQueries.getByText(
          "Workspaces, projects, and tasks are limited by your current membership and role."
        )
      ).toBeVisible();
      expect(
        sidebarQueries.queryByText("Auth secured")
      ).not.toBeInTheDocument();
    }
  });

  it("keeps current profile actions without advertising unavailable actions", async () => {
    const user = userEvent.setup();
    render(<AppShell>Workspace content</AppShell>);

    await user.click(screen.getByRole("button", { name: /Task Owner/ }));

    const menu = await screen.findByRole("menu");
    const menuQueries = within(menu);
    expect(menuQueries.getByText("Theme")).toBeVisible();
    const menuItems = menuQueries.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(2);
    expect(
      menuQueries.getByRole("menuitem", { name: /Sign out of this device/ })
    ).toBeVisible();
    expect(
      menuQueries.getByRole("menuitem", {
        name: /Sign out from all devices and browsers/
      })
    ).toBeVisible();
    for (const unavailableItem of [
      "Profile",
      "Settings",
      "Security",
      "Sessions"
    ]) {
      expect(
        menuQueries.queryByRole("menuitem", { name: unavailableItem })
      ).not.toBeInTheDocument();
    }
  });
});
