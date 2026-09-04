import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { playwrightReporting } from "./playwright-reporting.mjs";

test("CI reports and attachments are isolated across all three suites", () => {
  const roots = new Set();
  for (const suite of ["compatibility", "mocked", "live"]) {
    const settings = playwrightReporting(suite, true);
    assert.equal(settings.reporter[0][0], "list");
    const [reporter, options] = settings.reporter[1];
    assert.equal(reporter, "junit");
    assert.equal(options.includeProjectInTestName, true);
    assert.equal(options.stripANSIControlSequences, true);
    assert.equal(path.dirname(options.outputFile), path.dirname(settings.outputDir));
    assert.notEqual(options.outputFile, settings.outputDir);
    roots.add(path.dirname(settings.outputDir));
  }
  assert.equal(roots.size, 3);
});

test("local runs retain list reporting and suite selection is bounded", () => {
  assert.equal(playwrightReporting("live", false).reporter, "list");
  assert.throws(() => playwrightReporting("../outside", true), /Unknown/);
});
