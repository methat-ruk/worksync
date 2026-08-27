import { expect, test } from "@playwright/test";

const user = {
  id: "user-1",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  createdAt: "2026-06-23T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z"
};

const authBody = {
  success: true,
  message: "Authentication successful",
  data: {
    user,
    accessToken: "test-access-token",
    tokenType: "Bearer",
    expiresIn: 900
  }
};

const workspace = {
  id: "workspace-1",
  name: "Product Team",
  slug: "product-team",
  createdAt: "2026-07-08T08:00:00.000Z",
  updatedAt: "2026-07-08T08:00:00.000Z",
  membershipRole: "OWNER"
};

const apiUrl = (path: string) => `http://localhost:4000${path}`;
const workspaceCollectionUrl =
  /^http:\/\/localhost:4000\/api\/workspaces(?:\?.*)?$/;
const projectCollectionUrl =
  /^http:\/\/localhost:4000\/api\/workspaces\/[^/]+\/projects(?:\?.*)?$/;
const taskCollectionUrl =
  /^http:\/\/localhost:4000\/api\/workspaces\/[^/]+\/projects\/[^/]+\/tasks(?:\?.*)?$/;

test.beforeEach(async ({ page }) => {
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
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
  await page.route(projectCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [], page: 1, pageSize: 20, total: 0 }
      })
    })
  );
  await page.route(taskCollectionUrl, (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [], page: 1, pageSize: 20, total: 0 }
      })
    });
  });
});

test("keeps landing navigation accessible and centered", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");
  const header = page.locator("header");
  const signIn = header.getByRole("link", { name: "Sign in", exact: true });
  const getStarted = header.getByRole("link", {
    name: "Get started",
    exact: true
  });
  await expect(signIn).toHaveCSS("align-items", "center");
  await expect(signIn).toHaveCSS("justify-content", "center");
  await expect(getStarted).toHaveCSS("align-items", "center");
  await expect(getStarted).toHaveCSS("justify-content", "center");

  await page.goto("/login");
  await page.getByRole("link", { name: "WorkSync home" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  expect(consoleErrors.join("\n")).not.toContain(
    "A component that acts as a button expected a native <button>"
  );
});

test("protects the app route and keeps Google disabled when unconfigured", async ({
  page
}) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/, {
    timeout: 15_000
  });
  await expect(
    page.getByRole("button", { name: "Continue with Google" })
  ).toBeDisabled();
});

test("blocks weak signup and never sends confirmPassword", async ({ page }) => {
  let requestBody: Record<string, unknown> | null = null;
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.route(apiUrl("/api/auth/signup"), async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Account created" })
    });
  });

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password1234");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("password1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Your password must meet every requirement below.")
  ).toBeVisible();
  expect(requestBody).toBeNull();

  const strongPassword = "orbit lantern velvet meadow 47";
  await page.getByLabel("Password", { exact: true }).fill(strongPassword);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(strongPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(requestBody).toEqual({
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    password: strongPassword
  });
  expect(requestBody).not.toHaveProperty("confirmPassword");
  expect(page.url()).not.toContain(strongPassword);
  const browserStorage = await page.evaluate(() =>
    JSON.stringify({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage }
    })
  );
  expect(browserStorage).not.toContain(strongPassword);
  expect(consoleMessages.join("\n")).not.toContain(strongPassword);
});

test("shows login failure feedback without navigating", async ({ page }) => {
  await page.route(apiUrl("/api/auth/login"), (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Invalid email or password",
        data: { code: "INVALID_CREDENTIALS" }
      })
    })
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(
    page.getByText("We couldn't complete that request")
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
});

test("shows auth rate-limit feedback on login and signup", async ({ page }) => {
  const rateLimitedBody = {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    data: { code: "RATE_LIMITED" }
  };
  await page.route(apiUrl("/api/auth/login"), (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify(rateLimitedBody)
    })
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Too many attempts. Please wait and try again.")
  ).toBeVisible();

  await page.route(apiUrl("/api/auth/signup"), (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify(rateLimitedBody)
    })
  );
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("orbit lantern velvet meadow 47");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("orbit lantern velvet meadow 47");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Too many attempts. Please wait and try again.")
  ).toBeVisible();
});

test("keeps protected content hidden and recovers after refresh failure", async ({
  page
}) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Internal server error",
        data: { code: "INTERNAL_SERVER_ERROR" }
      })
    })
  );

  await page.goto("/app");
  await expect(page.getByText("We couldn't load this page.")).toBeVisible();
  await expect(page.getByText("Workspace bootstrap")).not.toBeVisible();
  await expect(page).toHaveURL(/\/app$/);

  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Product Team").first()).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
});

test("announces retry loading and returns to one recovery action after repeated failure", async ({
  page
}) => {
  let refreshRequests = 0;
  let releaseRetry = () => {};
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });

  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), async (route) => {
    refreshRequests += 1;
    if (refreshRequests > 1) {
      await retryGate;
    }
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
  const retry = page.getByRole("button", { name: "Retry" });
  const recoveryAlert = page.locator("[data-slot='alert']");
  await expect(recoveryAlert).toHaveText(
    "We couldn't load this page."
  );

  await retry.click();
  await expect(page.getByRole("status")).toHaveText("Checking your session…");
  releaseRetry();

  await expect(recoveryAlert).toHaveText(
    "We couldn't load this page."
  );
  await expect(retry).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
});

test("keeps public auth forms hidden until refresh can decide", async ({ page }) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Internal server error",
        data: { code: "INTERNAL_SERVER_ERROR" }
      })
    })
  );

  await page.goto("/login");
  await expect(page.getByText("We couldn't load this page.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
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

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("redirects an existing session away from public auth routes", async ({
  page
}) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );

  await page.goto("/login");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/app$/);
});

test("uses a safe local next path after login", async ({ page }) => {
  await page.route(apiUrl("/api/auth/login"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authBody)
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );

  await page.goto("/login?next=%2Fapp%3Ftab%3Dboard%23task");
  await page.getByLabel("Email").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/app\?tab=board#task$/);
});

test("falls back to the app for unsafe encoded and normalized next paths", async ({
  page
}) => {
  await page.route(apiUrl("/api/auth/login"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authBody)
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );

  await page.goto("/login?next=%252F%252Fevil.example");
  await page.getByLabel("Email").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/login?next=%2F..%2F%2Fevil.example");
  await page.getByLabel("Email").fill("ada@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/app$/);
});

test("recovers Google callback completion without restarting sign-in", async ({
  page
}) => {
  let releaseRetry = () => {};
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });

  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Internal server error",
        data: { code: "INTERNAL_SERVER_ERROR" }
      })
    })
  );

  await page.goto("/?auth=google-success");
  await expect(
    page.getByText("We couldn't finish signing you in.")
  ).toBeVisible();

  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), async (route) => {
    await retryGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    });
  });
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Finishing Google sign-in…"
  );
  releaseRetry();
  await expect(page).toHaveURL(/\/app$/);
});

test("shows real workspace data for authenticated users", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [workspace],
          page: 1,
          pageSize: 20,
          total: 1
        }
      })
    })
  );

  await page.goto("/app");

  await expect(page.getByText("Workspace bootstrap")).toBeVisible();
  await expect(page.getByText("Product Team").first()).toBeVisible();
  await expect(page.getByText("OWNER").first()).toBeVisible();
  await expect(page.getByText("/product-team").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("creates and displays a project in the selected workspace", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  let requestBody: Record<string, unknown> | null = null;
  let createdProject: Record<string, unknown> | null = null;
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );
  await page.unroute(projectCollectionUrl);
  await page.route(projectCollectionUrl, async (route) => {
    if (route.request().method() === "POST") {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      createdProject = {
        id: "project-1",
        name: "WorkSync",
        key: "WSYNC",
        createdAt: "2026-07-30T08:00:00.000Z",
        updatedAt: "2026-07-30T08:00:00.000Z"
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Project created",
          data: { project: createdProject }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: createdProject ? [createdProject] : [],
          page: 1,
          pageSize: 20,
          total: createdProject ? 1 : 0
        }
      })
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(page.getByText("No projects in this workspace")).toBeVisible();
  await page.getByLabel("Project name").fill(" WorkSync ");
  await page.getByLabel("Project key").fill("wsync");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByText("WorkSync is ready.")).toBeVisible();
  await expect(page.getByText("WSYNC")).toBeVisible();
  await expect(page.getByText("1 total").last()).toBeVisible();
  expect(requestBody).toEqual({ name: "WorkSync", key: "WSYNC" });
  expect(consoleErrors).toEqual([]);
});

test("keeps project creation unavailable for viewers", async ({ page }) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [{ ...workspace, membershipRole: "VIEWER" }],
          page: 1,
          pageSize: 20,
          total: 1
        }
      })
    })
  );

  await page.goto("/app");
  await expect(
    page.getByText(/Your VIEWER role is read-only/)
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create project" })
  ).not.toBeVisible();
});

test("recovers when the selected workspace project list fails", async ({
  page
}) => {
  let projectRequests = 0;
  let projectListAvailable = false;
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [workspace], page: 1, pageSize: 20, total: 1 }
      })
    })
  );
  await page.unroute(projectCollectionUrl);
  await page.route(projectCollectionUrl, (route) => {
    projectRequests += 1;
    if (!projectListAvailable) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Internal server error",
          data: { code: "INTERNAL_ERROR" }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { items: [], page: 1, pageSize: 20, total: 0 }
      })
    });
  });

  await page.goto("/app");
  await expect(page.getByText("Internal server error")).toBeVisible();
  projectListAvailable = true;
  await page.getByRole("button", { name: "Retry projects" }).click();

  await expect(page.getByText("No projects in this workspace")).toBeVisible();
  expect(projectRequests).toBeGreaterThanOrEqual(2);
});

test("loads and selects workspaces beyond the first page", async ({ page }) => {
  const consoleErrors: string[] = [];
  const requestedPages: number[] = [];
  const workspaces = Array.from({ length: 21 }, (_, index) => {
    const position = index + 1;
    return {
      ...workspace,
      id: `workspace-${position}`,
      name: `Workspace ${String(position).padStart(2, "0")}`,
      slug: `workspace-${position}`,
      membershipRole: position === 1 ? "OWNER" : "MEMBER"
    };
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const start = (pageNumber - 1) * pageSize;
    requestedPages.push(pageNumber);

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: workspaces.slice(start, start + pageSize),
          page: pageNumber,
          pageSize,
          total: workspaces.length
        }
      })
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");

  await expect(page.getByText("21 total")).toBeVisible();
  await expect(page.getByText("20 of 21 loaded")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();

  const laterWorkspace = page.getByRole("button", {
    name: /Workspace 21/
  });
  await expect(laterWorkspace).toBeVisible();
  await laterWorkspace.click();

  await expect(laterWorkspace).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("21 of 21 loaded")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more" })
  ).not.toBeVisible();
  expect(
    requestedPages.filter((pageNumber) => pageNumber === 1).length
  ).toBeGreaterThanOrEqual(1);
  expect(
    requestedPages.filter((pageNumber) => pageNumber === 2)
  ).toHaveLength(1);
  expect(
    requestedPages.every((pageNumber) => [1, 2].includes(pageNumber))
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("creates the first workspace from the app empty state", async ({ page }) => {
  let createRequestBody: Record<string, unknown> | null = null;
  let createAuthorization: string | null = null;

  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      createRequestBody = request.postDataJSON() as Record<string, unknown>;
      createAuthorization = request.headers().authorization ?? null;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Workspace created",
          data: { workspace }
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [],
          page: 1,
          pageSize: 20,
          total: 0
        }
      })
    });
  });

  await page.goto("/app");
  await expect(page.getByText("Create your first workspace")).toBeVisible();
  await page.getByLabel("Workspace name").fill(" Product Team ");
  const createWorkspaceButton = page.getByRole("button", {
    name: "Create workspace"
  });
  await expect(createWorkspaceButton).toHaveCSS("cursor", "pointer");
  await createWorkspaceButton.click();

  await expect(page.getByText("Product Team is ready.")).toBeVisible();
  await expect(page.getByText("Product Team").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Product Team/ }).first()
  ).toHaveCSS("cursor", "pointer");
  expect(createRequestBody).toEqual({ name: "Product Team" });
  expect(createAuthorization).toBe("Bearer test-access-token");
});

test("shows workspace loading failure feedback without blanking the app", async ({
  page
}) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Workspace service unavailable",
        data: { code: "INTERNAL_SERVER_ERROR" }
      })
    })
  );

  await page.goto("/app");

  await expect(page.getByText("We could not load your workspaces.")).toBeVisible();
  await expect(page.getByText("Workspace service unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
});

test("keeps the authenticated UI visible when logout fails", async ({ page }) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(apiUrl("/api/auth/logout"), (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "Logout failed"
      })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [workspace],
          page: 1,
          pageSize: 20,
          total: 1
        }
      })
    })
  );

  await page.goto("/app");
  await expect(page.getByText("Product Team").first()).toBeVisible();
  await page.locator("[data-slot='dropdown-menu-trigger']").click();
  await page
    .locator("[data-slot='dropdown-menu-item']")
    .filter({ hasText: "Sign out" })
    .first()
    .click();

  await expect(page.getByText("Logout failed")).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Product Team").first()).toBeVisible();
});

test("logs out successfully and returns to sign in", async ({ page }) => {
  await page.unroute(apiUrl("/api/auth/refresh"));
  await page.route(apiUrl("/api/auth/refresh"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...authBody, message: "Authentication refreshed" })
    })
  );
  await page.route(apiUrl("/api/auth/logout"), (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Logged out" })
    })
  );
  await page.route(workspaceCollectionUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [workspace],
          page: 1,
          pageSize: 20,
          total: 1
        }
      })
    })
  );

  await page.goto("/app");
  await page.locator("[data-slot='dropdown-menu-trigger']").click();
  await page
    .locator("[data-slot='dropdown-menu-item']")
    .filter({ hasText: "Sign out" })
    .first()
    .click();

  await expect(page).toHaveURL(/\/login$/);
});
