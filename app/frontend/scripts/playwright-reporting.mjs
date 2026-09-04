import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = new Set(["compatibility", "mocked", "live"]);

export function playwrightReporting(suite, ci = Boolean(process.env.CI)) {
  if (!suites.has(suite)) {
    throw new Error("Unknown Playwright report suite");
  }
  const suiteRoot = path.join(frontendRoot, "test-results", suite);
  return {
    // Keep attachments separate: Playwright clears outputDir when a run starts.
    outputDir: path.join(suiteRoot, "artifacts"),
    reporter: ci
      ? [["list"], ["junit", {
          outputFile: path.join(suiteRoot, "junit.xml"),
          includeProjectInTestName: true,
          stripANSIControlSequences: true
        }]]
      : "list"
  };
}
