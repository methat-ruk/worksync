import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";

const palette = {
  primary: "#2563eb",
  destructive: "#dc2626",
  success: "#15803d",
  warning: "#b45309"
} as const;

const darkEmphasisPalette = {
  primary: "#93c5fd",
  destructive: "#fca5a5",
  success: "#86efac",
  warning: "#fcd34d"
} as const;

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported hex color: ${hex}`);
  }
  const convertedChannels = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  );
  const red = convertedChannels[0]!;
  const green = convertedChannels[1]!;
  const blue = convertedChannels[2]!;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("shared semantic variants", () => {
  it.each([
    ["default", "bg-primary", "hover:bg-primary-hover"],
    ["destructive", "bg-destructive", "hover:bg-destructive-hover"],
    ["success", "bg-success", "hover:bg-success-hover"],
    ["warning", "bg-warning", "hover:bg-warning-hover"]
  ] as const)("owns the %s solid button palette", (variant, base, hover) => {
    const classes = buttonVariants({ variant });
    expect(classes).toContain(base);
    expect(classes).toContain(hover);
  });

  it.each([
    ["destructive", "text-destructive-emphasis"],
    ["success", "text-success-emphasis"],
    ["warning", "text-warning-emphasis"]
  ] as const)("owns the %s soft badge palette", (variant, textClass) => {
    expect(badgeVariants({ variant })).toContain(textClass);
  });

  it("defines each solid action color once for both themes", () => {
    const globalStyles = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8"
    );

    for (const [token, color] of Object.entries(palette)) {
      expect(globalStyles.match(new RegExp(`--${token}:`, "g"))).toHaveLength(
        1
      );
      expect(globalStyles).toContain(`--${token}: ${color};`);
    }
  });

  it.each(Object.entries(palette))(
    "keeps %s solid contrast at WCAG AA for normal white text",
    (_token, color) => {
      expect(contrast(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(Object.entries(darkEmphasisPalette))(
    "keeps %s emphasis contrast at WCAG AA on the dark card surface",
    (token, color) => {
      const globalStyles = readFileSync(
        join(process.cwd(), "src", "app", "globals.css"),
        "utf8"
      );
      expect(globalStyles).toContain(`--${token}-emphasis: ${color};`);
      expect(contrast(color, "#252939")).toBeGreaterThanOrEqual(4.5);
    }
  );
});
