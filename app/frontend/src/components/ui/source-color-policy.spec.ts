import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const rawChromaticUtility =
  /(?:^|[\s"'`])(?:(?:dark|hover|focus|focus-visible|active|disabled):)*(?:bg|text|border|shadow|from|via|to)-(?:blue|red|green|yellow|amber|orange|emerald|rose|violet)-\d+/g;

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return tsxFiles(path);
    }
    return extname(path) === ".tsx" ? [path] : [];
  });
}

describe("frontend source color policy", () => {
  it("keeps chromatic action and status colors in shared semantic owners", () => {
    const violations = tsxFiles(sourceRoot).flatMap((path) => {
      if (path.endsWith("google-icon.tsx")) {
        return [];
      }
      const matches = readFileSync(path, "utf8").match(
        rawChromaticUtility
      );
      return matches?.map(
        (match) => `${relative(sourceRoot, path)}: ${match.trim()}`
      ) ?? [];
    });

    expect(violations).toEqual([]);
  });
});
