import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";

async function createSession(
  context: BrowserContext,
  suffix: string
): Promise<string> {
  const displayName = `Live Auth ${suffix}`;
  const response = await context.request.post(`${apiBaseUrl}/api/auth/signup`, {
    data: {
      displayName,
      email: `live-auth-${suffix}-${Date.now()}@example.com`,
      password: "correct horse battery staple"
    }
  });
  expect(response.status()).toBe(201);
  return displayName;
}

async function expectAuthenticated(page: Page, displayName: string) {
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByText(displayName).first()).toBeVisible();
}

test("serializes two-tab bootstrap and broadcasts logout invalidation", async ({
  browser
}) => {
  const context = await browser.newContext();
  try {
    const displayName = await createSession(context, "locks");
    const first = await context.newPage();
    const second = await context.newPage();

    await Promise.all([first.goto("/app"), second.goto("/app")]);
    await Promise.all([
      expectAuthenticated(first, displayName),
      expectAuthenticated(second, displayName)
    ]);

    await first.locator("[data-slot='dropdown-menu-trigger']").click();
    await first
      .locator("[data-slot='dropdown-menu-item']")
      .filter({ hasText: "Sign out" })
      .first()
      .click();

    await Promise.all([
      expect(first).toHaveURL(/\/login(?:\?|$)/),
      expect(second).toHaveURL(/\/login(?:\?|$)/)
    ]);
  } finally {
    await context.close();
  }
});

test("recovers both tabs through the real 200/409 backend seam without Web Locks", async ({
  browser
}) => {
  const context = await browser.newContext();
  let release: (() => void) | undefined;
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined
    });
  });
  try {
    const displayName = await createSession(context, "no-locks");
    let arrivals = 0;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    await context.route(`${apiBaseUrl}/api/auth/refresh`, async (route) => {
      arrivals += 1;
      if (arrivals <= 2) {
        if (arrivals === 2) {
          release?.();
        }
        await barrier;
      }
      await route.continue();
    });

    const statuses: number[] = [];
    const recordRefresh = (page: Page) => {
      page.on("response", (response) => {
        if (
          response.url() === `${apiBaseUrl}/api/auth/refresh` &&
          statuses.length < 2
        ) {
          statuses.push(response.status());
        }
      });
    };
    const first = await context.newPage();
    const second = await context.newPage();
    recordRefresh(first);
    recordRefresh(second);

    await Promise.all([first.goto("/app"), second.goto("/app")]);
    await Promise.all([
      expectAuthenticated(first, displayName),
      expectAuthenticated(second, displayName)
    ]);
    expect(statuses.sort()).toEqual([200, 409]);
  } finally {
    release?.();
    await context.close();
  }
});
