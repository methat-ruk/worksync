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

const apiUrl = (path: string) => `http://localhost:4000${path}`;

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

test("exits protected-route loading when refresh fails", async ({ page }) => {
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
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/, {
    timeout: 15_000
  });
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

  await page.goto("/app");
  await expect(page.getByText("Your WorkSync overview")).toBeVisible();
  await page.locator("[data-slot='dropdown-menu-trigger']").click();
  await page
    .locator("[data-slot='dropdown-menu-item']")
    .filter({ hasText: "Sign out" })
    .first()
    .click();

  await expect(page.getByText("Logout failed")).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Your WorkSync overview")).toBeVisible();
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

  await page.goto("/app");
  await page.locator("[data-slot='dropdown-menu-trigger']").click();
  await page
    .locator("[data-slot='dropdown-menu-item']")
    .filter({ hasText: "Sign out" })
    .first()
    .click();

  await expect(page).toHaveURL(/\/login$/);
});
