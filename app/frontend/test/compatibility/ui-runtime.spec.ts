import { expect, test, type Locator, type Page } from "@playwright/test";

const refreshUrl = "http://localhost:4000/api/auth/refresh";

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

async function addUtilityProbes(page: Page) {
  return page.evaluate(() => {
    const textarea = document.createElement("textarea");
    textarea.className = "min-h-16";

    const anchored = document.createElement("div");
    anchored.className =
      "w-(--anchor-width) max-h-(--available-height) origin-(--transform-origin)";
    anchored.style.setProperty("--anchor-width", "144px");
    anchored.style.setProperty("--available-height", "96px");
    anchored.style.setProperty("--transform-origin", "12px 8px");

    document.body.append(textarea, anchored);

    const textareaStyle = getComputedStyle(textarea);
    const anchoredStyle = getComputedStyle(anchored);

    return {
      minHeight: textareaStyle.minHeight,
      maxHeight: anchoredStyle.maxHeight,
      transformOrigin: anchoredStyle.transformOrigin,
      width: anchoredStyle.width
    };
  });
}

test("renders the Tailwind and shadcn runtime contract", async ({ page }) => {
  const consoleErrors: string[] = [];
  let refreshRequests = 0;

  page.on("console", (message) => {
    if (message.type() === "error") {
      const isExpectedRefreshFailure =
        message.location().url === refreshUrl &&
        message.text().includes("status of 500");

      if (!isExpectedRefreshFailure) {
        consoleErrors.push(message.text());
      }
    }
  });
  await page.addInitScript(() => {
    if (localStorage.getItem("worksync.theme") === null) {
      localStorage.setItem("worksync.theme", "light");
    }
  });
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

  const probes = await addUtilityProbes(page);
  expect(probes.minHeight).toBe("64px");
  expect(probes.width).toBe("144px");
  expect(probes.maxHeight).toBe("96px");
  expect(probes.transformOrigin).toBe("12px 8px");

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
