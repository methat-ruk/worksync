import { expect, test, type Locator, type Page } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";
const apiUrl = (path: string) => `${apiBaseUrl}${path}`;
const refreshUrl = apiUrl("/api/auth/refresh");

const user = {
  id: "user-1",
  email: "owner@example.com",
  displayName: "Task Owner",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const workspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  membershipRole: "OWNER",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const project = {
  id: "project-1",
  name: "WorkSync",
  key: "WSYNC",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z"
};

const taskItem = {
  id: "task-1",
  projectId: project.id,
  title: "Ship task workflow",
  description: "Browser-visible task state",
  status: "BACKLOG",
  dueDate: null,
  creator: { id: user.id, displayName: user.displayName },
  assignee: null,
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:00:00.000Z"
};

function collectUnexpectedConsoleErrors(
  page: Page,
  expectedRefreshStatuses: number[] = []
) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const isExpectedRefreshFailure =
      message.location().url === refreshUrl &&
      expectedRefreshStatuses.some((status) =>
        message.text().includes(`status of ${status}`)
      );

    if (!isExpectedRefreshFailure) {
      errors.push(message.text());
    }
  });

  return errors;
}

async function setInitialTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((initialTheme) => {
    if (localStorage.getItem("worksync.theme") === null) {
      localStorage.setItem("worksync.theme", initialTheme);
    }
  }, theme);
}

async function expectAlertLayout(alert: Locator) {
  await expect(alert).toBeVisible();
  await expect(alert).toHaveCSS("display", "grid");

  const layout = await alert.evaluate((element) => {
    const icon = element.querySelector("svg");
    const title = element.querySelector<HTMLElement>(
      "[data-slot='alert-title']"
    );
    const description = element.querySelector<HTMLElement>(
      "[data-slot='alert-description']"
    );
    const style = getComputedStyle(element);
    const iconBounds = icon?.getBoundingClientRect();
    const titleBounds = title?.getBoundingClientRect();
    const descriptionBounds = description?.getBoundingClientRect();

    return {
      clientWidth: element.clientWidth,
      columnGap: Number.parseFloat(style.columnGap),
      columns: style.gridTemplateColumns,
      descriptionX: descriptionBounds?.x ?? 0,
      iconX: iconBounds?.x ?? 0,
      scrollWidth: element.scrollWidth,
      titleColumnStart: title ? getComputedStyle(title).gridColumnStart : "",
      titleX: titleBounds?.x ?? 0
    };
  });

  expect(layout.columns).not.toBe("none");
  expect(layout.columns.trim().split(/\s+/)).toHaveLength(2);
  expect(layout.columnGap).toBeGreaterThan(0);
  expect(layout.titleColumnStart).toBe("2");
  expect(layout.titleX).toBeGreaterThan(layout.iconX);
  expect(layout.descriptionX).toBeGreaterThan(layout.iconX);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
}

async function mockAuthenticatedApp(page: Page) {
  let releaseWorkspaceResponse = () => {};
  const workspaceResponseGate = new Promise<void>((resolve) => {
    releaseWorkspaceResponse = resolve;
  });

  await page.route(refreshUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Session refreshed",
        data: {
          user,
          accessToken: "compatibility-access-token",
          tokenType: "Bearer",
          expiresIn: 900
        }
      })
    })
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces(?:\?.*)?$/,
    async (route) => {
      await workspaceResponseGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
        })
      });
    }
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/projects(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [project], page: 1, pageSize: 20, total: 1 }
        })
      })
  );
  await page.route(
    /^http:\/\/localhost:4000\/api\/workspaces\/workspace-1\/projects\/project-1\/tasks(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: [taskItem], page: 1, pageSize: 20, total: 1 }
        })
      })
  );

  return releaseWorkspaceResponse;
}

test("renders landing and authentication primitives from production CSS", async ({
  page
}) => {
  const consoleErrors = collectUnexpectedConsoleErrors(page, [401]);
  await setInitialTheme(page, "light");
  await page.route(refreshUrl, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Authentication required",
        data: { code: "AUTHENTICATION_REQUIRED" }
      })
    })
  );

  await page.goto("/");
  const getStarted = page.getByRole("link", { name: "Get started" }).first();
  await expect(getStarted).toHaveCSS("background-color", "rgb(37, 99, 235)");
  await getStarted.focus();
  await expect(getStarted).toBeFocused();

  await page.goto("/signup");
  const email = page.getByRole("textbox", { name: "Email" });
  await email.focus();
  await expect(email).toBeFocused();
  expect(await email.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe("none");

  const googleButton = page.getByRole("button", {
    name: "Continue with Google"
  });
  await expect(googleButton).toBeDisabled();
  await expect(googleButton).toHaveCSS("opacity", "0.5");
  await googleButton.locator("..").hover();
  const tooltip = page.getByText("Google sign-in is coming soon.");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toHaveCSS("transform-origin", "50% 50%");

  const password = page.getByLabel("Password", { exact: true });
  const progress = page.getByRole("progressbar", { name: "Password strength" });
  await expect(progress).toBeVisible();
  await password.fill("correct horse battery staple");
  await expect(progress).toHaveAttribute("aria-valuenow", /[2-9][0-9]|100/);
  await expect(page.locator("[data-slot='progress-track']")).toHaveCSS(
    "height",
    "4px"
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Create your account" })
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("renders the responsive recovery Alert in light and dark themes", async ({
  page
}) => {
  const consoleErrors = collectUnexpectedConsoleErrors(page, [500]);
  let refreshRequests = 0;

  await setInitialTheme(page, "light");
  await page.route(refreshUrl, async (route) => {
    refreshRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Internal server error",
        data: { code: "INTERNAL_SERVER_ERROR" }
      })
    });
  });

  await page.goto("/app");
  await expect(page).toHaveTitle("WorkSync");

  const alert = page.locator("[data-slot='alert']");
  await expectAlertLayout(alert);

  const desktopWidth = await alert.evaluate((element) => element.clientWidth);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAlertLayout(alert);
  const mobileWidth = await alert.evaluate((element) => element.clientWidth);
  expect(mobileWidth).toBeLessThan(desktopWidth);

  await page.evaluate(() => {
    localStorage.setItem("worksync.theme", "dark");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expectAlertLayout(alert);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => refreshRequests).toBeGreaterThan(2);
  await expectAlertLayout(alert);
  expect(consoleErrors).toEqual([]);
});

test("renders authenticated app, task, and overlay primitives from actual routes", async ({
  page
}) => {
  const consoleErrors = collectUnexpectedConsoleErrors(page);
  await setInitialTheme(page, "light");
  const releaseWorkspaceResponse = await mockAuthenticatedApp(page);

  await page.goto("/app");
  await expect(page.locator("[data-slot='skeleton']").first()).toBeVisible();
  releaseWorkspaceResponse();
  await expect(page.getByText(taskItem.title)).toBeVisible();
  await expect(page.locator("[data-slot='badge']").first()).toBeVisible();
  await expect(page.locator("[data-slot='avatar']").first()).toBeVisible();
  await expect(page.locator("[data-slot='separator']").first()).toBeVisible();

  await page.getByRole("button", { name: new RegExp(user.displayName) }).click();
  const menu = page.locator("[data-slot='dropdown-menu-content']");
  await expect(menu).toBeVisible();
  await expect(menu).not.toHaveCSS("max-height", "none");
  await expect(menu).not.toHaveCSS("transform-origin", "50% 50%");
  const disabledProfileItem = page.getByRole("menuitem", { name: /Profile/ });
  await expect(disabledProfileItem).toBeVisible();
  await expect(disabledProfileItem).toBeDisabled();

  await page.getByText("Sign out all devices", { exact: true }).click();
  const alertDialog = page.getByRole("alertdialog");
  await expect(alertDialog).toBeVisible();
  await expect(alertDialog).toHaveCSS("position", "fixed");
  await alertDialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Create task" }).click();
  const taskSheet = page.getByRole("dialog", { name: "Create task" });
  await expect(taskSheet).toBeVisible();
  await expect(taskSheet).toHaveCSS("position", "fixed");
  const description = taskSheet.getByLabel("Description");
  await expect(description).toHaveCSS("min-height", "64px");
  await description.focus();
  await expect(description).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(taskSheet).toBeVisible();
  const sheetWidth = await taskSheet.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth
  }));
  expect(sheetWidth.scroll).toBeLessThanOrEqual(sheetWidth.client + 1);
  expect(consoleErrors).toEqual([]);
});
