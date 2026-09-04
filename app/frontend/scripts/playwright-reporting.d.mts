import type { PlaywrightTestConfig } from "@playwright/test";

export function playwrightReporting(
  suite: "compatibility" | "mocked" | "live",
  ci?: boolean
): Pick<PlaywrightTestConfig, "outputDir" | "reporter">;
