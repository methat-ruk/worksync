"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const {
  JOBS_PROCESS_SUITE,
  JOBS_PROCESS_TEST_NAMES,
  discoverJobsProcessTestNames,
  validateJobsProcessReport
} = require("./ci-jobs-process-result.cjs");
const { createTestNamePattern, groups } = require("./run-jobs-process-ci.cjs");

function report(overrides = {}) {
  return {
    success: true,
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 1,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTotalTestSuites: 1,
    numTotalTests: JOBS_PROCESS_TEST_NAMES.length,
    numPassedTests: JOBS_PROCESS_TEST_NAMES.length,
    wasInterrupted: false,
    testResults: [{
      name: `/github/workspace/${JOBS_PROCESS_SUITE}`,
      status: "passed",
      assertionResults: JOBS_PROCESS_TEST_NAMES.map((fullName) => ({ fullName, status: "passed" }))
    }],
    ...overrides
  };
}

test("accepts one complete jobs process suite", () => {
  assert.deepEqual(validateJobsProcessReport(report()), {
    suite: JOBS_PROCESS_SUITE,
    tests: 9
  });
});

test("accepts a selected group with pending nonselected tests", () => {
  const selected = JOBS_PROCESS_TEST_NAMES[0];
  const partial = report({
    numTotalTests: JOBS_PROCESS_TEST_NAMES.length,
    numPassedTests: 1,
    numPendingTests: JOBS_PROCESS_TEST_NAMES.length - 1,
    testResults: [{
      name: `/github/workspace/${JOBS_PROCESS_SUITE}`,
      status: "focused",
      assertionResults: JOBS_PROCESS_TEST_NAMES.map((fullName) => ({
        fullName,
        status: fullName === selected ? "passed" : "pending"
      }))
    }]
  });
  assert.deepEqual(
    validateJobsProcessReport(partial, { expectedTests: [selected], allowPending: true }),
    { suite: JOBS_PROCESS_SUITE, tests: 1 }
  );
  assert.throws(() => validateJobsProcessReport(partial, { expectedTests: [selected] }));
});

test("keeps the CI inventory synchronized with the executable suite", () => {
  assert.deepEqual(discoverJobsProcessTestNames(), JOBS_PROCESS_TEST_NAMES);
});

test("parallel process groups cover each jobs test exactly once", () => {
  const grouped = groups.flatMap((group) => group.tests);
  assert.equal(grouped.length, JOBS_PROCESS_TEST_NAMES.length);
  assert.deepEqual([...new Set(grouped)].sort(), [...JOBS_PROCESS_TEST_NAMES].sort());
  for (const group of groups) {
    assert.match(createTestNamePattern(group.tests), /^\^\(\?:.*\)\$$/);
  }
});

test("rejects incomplete, failed, skipped, and unexpected evidence", () => {
  for (const invalid of [
    { success: false },
    { numPendingTests: 1 },
    { wasInterrupted: true },
    { testResults: [] },
    { numPassedTests: 8 },
    { testResults: [{
      name: `/github/workspace/${JOBS_PROCESS_SUITE}`,
      status: "passed",
      assertionResults: JOBS_PROCESS_TEST_NAMES.slice(1).map((fullName) => ({ fullName, status: "passed" }))
    }] },
    { testResults: [{ name: "other.spec.ts", status: "passed" }] },
    { testResults: [{ name: `/github/workspace/${JOBS_PROCESS_SUITE}`, status: "failed" }] }
  ]) {
    assert.throws(() => validateJobsProcessReport(report(invalid)));
  }
});

test("the CI entry point preserves the validator's exit status", () => {
  const reportPath = path.join(__dirname, ".ci-jobs-process-result-self-test.json");
  const fs = require("node:fs");
  fs.writeFileSync(reportPath, JSON.stringify(report()));
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, "ci-jobs-process-result.cjs"), reportPath],
      { encoding: "utf8" }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(reportPath, { force: true });
  }
});
