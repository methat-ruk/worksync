import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const chromaticFamilies = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose"
].join("|");
const colorUtilities = [
  "accent",
  "bg",
  "border(?:-[trblxyse])?",
  "caret",
  "decoration",
  "divide",
  "drop-shadow",
  "fill",
  "from",
  "outline",
  "ring(?:-offset)?",
  "shadow",
  "stroke",
  "text",
  "to",
  "via"
].join("|");
const rawChromaticUtility = new RegExp(
  `(?:^|[^A-Za-z0-9_-])((?:${colorUtilities})-(?:${chromaticFamilies})-\\d{2,3})(?=$|[^A-Za-z0-9_-])`,
  "g"
);
const sourceExtensions = new Set([".ts", ".tsx"]);

function typeScriptSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptSourceFiles(path);
    }
    return sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

function findRawChromaticUtilities(source: string): string[] {
  return [...source.matchAll(rawChromaticUtility)].map((match) => match[1]!);
}

describe("frontend source color policy", () => {
  it.each([
    [
      ["sm", "hover", ["bg", "sky", "600"].join("-")].join(":"),
      ["bg", "sky", "600"].join("-")
    ],
    [
      ["group-hover", ["text", "purple", "700"].join("-")].join(":"),
      ["text", "purple", "700"].join("-")
    ],
    [
      ["dark", "focus-visible", ["ring", "cyan", "500"].join("-")].join(
        ":"
      ),
      ["ring", "cyan", "500"].join("-")
    ]
  ])("detects raw colors through modifier chains", (className, utility) => {
    expect(findRawChromaticUtilities(className)).toEqual([utility]);
  });

  it("includes TypeScript and TSX source files", () => {
    expect(sourceExtensions.has(".ts")).toBe(true);
    expect(sourceExtensions.has(".tsx")).toBe(true);
  });

  it("keeps chromatic action and status colors in shared semantic owners", () => {
    const violations = typeScriptSourceFiles(sourceRoot).flatMap((path) => {
      if (path.endsWith("google-icon.tsx")) {
        return [];
      }
      return findRawChromaticUtilities(readFileSync(path, "utf8")).map(
        (utility) => `${relative(sourceRoot, path)}: ${utility}`
      );
    });

    expect(violations).toEqual([]);
  });
});
