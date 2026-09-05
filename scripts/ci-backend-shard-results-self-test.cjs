"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  normalizeSuitePath,
  validateShardReports
} = require("./ci-backend-shard-results.cjs");

function report(suites, overrides = {}) {
  return {
    success: true,
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTotalTestSuites: suites.length,
    numPassedTestSuites: suites.length,
    numTotalTests: suites.length * 2,
    numPassedTests: suites.length * 2,
    wasInterrupted: false,
    testResults: suites.map((name) => ({ name, status: "passed" })),
    ...overrides
  };
}

const suiteA = "app/backend/test/integration/a.spec.ts";
const suiteB = "app/backend/test/contract/b.spec.ts";

test("accepts two nonempty, successful shards with an exact inventory", () => {
  assert.deepEqual(
    validateShardReports(
      [suiteA, suiteB],
      [report([`/github/workspace/${suiteA}`]), report([`C:\\repo\\${suiteB}`])]
    ),
    { suites: 2, tests: 4 }
  );
});

test("normalizes hosted Linux and Windows suite paths", () => {
  assert.equal(normalizeSuitePath(`/github/workspace/${suiteA}`), suiteA);
  assert.equal(normalizeSuitePath(`C:\\repo\\${suiteA}`), suiteA);
});

test("rejects incomplete, overlapping, failed, skipped, and empty evidence", () => {
  assert.throws(
    () => validateShardReports([suiteA, suiteB], [report([suiteA])]),
    /Expected 2/
  );
  assert.throws(
    () =>
      validateShardReports(
        [suiteA, suiteB],
        [report([suiteA]), report([suiteA, suiteB])]
      ),
    /overlap/
  );
  assert.throws(
    () =>
      validateShardReports(
        [suiteA, suiteB],
        [report([suiteA]), report([suiteB], { success: false })]
      ),
    /did not report success/
  );
  assert.throws(
    () =>
      validateShardReports(
        [suiteA, suiteB],
        [report([suiteA]), report([suiteB], { numPendingTests: 1 })]
      ),
    /numPendingTests=1/
  );
  assert.throws(
    () =>
      validateShardReports(
        [suiteA, suiteB],
        [report([suiteA]), report([suiteB], { wasInterrupted: true })]
      ),
    /was interrupted/
  );
  assert.throws(
    () => validateShardReports([suiteA], [report([suiteA]), report([])]),
    /did not execute any suites/
  );
  assert.throws(
    () => validateShardReports([suiteA, suiteB], [report([suiteA]), report([])]),
    /did not execute any suites/
  );
});
