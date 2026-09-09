"use strict";

const { execFileSync, spawn } = require("node:child_process");
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const {
  JOBS_PROCESS_TEST_NAMES,
  assertJobsProcessTestInventory,
  validateJobsProcessReport
} = require("./ci-jobs-process-result.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const backendRoot = path.join(repositoryRoot, "app", "backend");
const jestEntry = path.join(backendRoot, "node_modules", "jest", "bin", "jest.js");
const groups = [
  {
    id: "startup",
    tests: JOBS_PROCESS_TEST_NAMES.slice(0, 3).concat(JOBS_PROCESS_TEST_NAMES[8])
  },
  { id: "recovery", tests: JOBS_PROCESS_TEST_NAMES.slice(3, 5) },
  { id: "stall", tests: [JOBS_PROCESS_TEST_NAMES[5]] },
  { id: "watchdog", tests: [JOBS_PROCESS_TEST_NAMES[6]] },
  { id: "shutdown", tests: [JOBS_PROCESS_TEST_NAMES[7]] }
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createTestNamePattern(testNames) {
  return `^(?:${testNames.map(escapeRegex).join("|")})$`;
}

function runGroup(group, outputDirectory) {
  const reportPath = path.join(outputDirectory, `${group.id}.json`);
  const pattern = createTestNamePattern(group.tests);
  const arguments_ = [
    "--disable-warning=ExperimentalWarning",
    "--experimental-vm-modules",
    jestEntry,
    "--runInBand",
    "--selectProjects",
    "e2e",
    "--testPathPattern=jobs-process",
    "--testNamePattern",
    pattern,
    "--json",
    `--outputFile=${reportPath}`
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, arguments_, {
      cwd: backendRoot,
      env: process.env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve({ group, reportPath });
        return;
      }
      reject(new Error(`Jobs process group ${group.id} exited with ${signal ?? code}`));
    });
  });
}

async function main() {
  assertJobsProcessTestInventory();
  const groupedNames = groups.flatMap((group) => group.tests);
  const expectedNames = new Set(JOBS_PROCESS_TEST_NAMES);
  if (groupedNames.length !== expectedNames.size || new Set(groupedNames).size !== expectedNames.size ||
      groupedNames.some((name) => !expectedNames.has(name))) {
    throw new Error("Jobs process groups do not cover the current test inventory exactly once");
  }
  const outputDirectory = path.resolve(process.argv[2] ?? "test-results/jobs-process");
  mkdirSync(outputDirectory, { recursive: true });
  for (const group of groups) rmSync(path.join(outputDirectory, `${group.id}.json`), { force: true });
  rmSync(path.join(outputDirectory, "jobs-process.json"), { force: true });

  execFileSync("pnpm", ["--filter", "@worksync/backend", "build"], {
    cwd: repositoryRoot,
    stdio: "inherit"
  });
  const completed = await Promise.all(groups.map((group) => runGroup(group, outputDirectory)));
  const assertions = [];
  for (const { group, reportPath } of completed) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const result = validateJobsProcessReport(report, {
      expectedTests: group.tests,
      allowPending: true
    });
    assertions.push(...group.tests.map((fullName) =>
      report.testResults[0].assertionResults.find((assertion) => assertion.fullName === fullName)
    ));
  }
  const names = new Set(assertions.map((assertion) => assertion.fullName));
  if (names.size !== JOBS_PROCESS_TEST_NAMES.length) {
    throw new Error(`Jobs process groups covered ${names.size}/${JOBS_PROCESS_TEST_NAMES.length} tests`);
  }
  const merged = {
    success: true,
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 1,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTotalTestSuites: 1,
    numTotalTests: assertions.length,
    numPassedTests: assertions.length,
    wasInterrupted: false,
    testResults: [{
      name: path.join(backendRoot, "test", "e2e", "jobs-process.e2e.spec.ts"),
      status: "passed",
      assertionResults: assertions
    }]
  };
  validateJobsProcessReport(merged);
  writeFileSync(path.join(outputDirectory, "jobs-process.json"), `${JSON.stringify(merged)}\n`);
  process.stdout.write(`Jobs process groups passed ${assertions.length} tests.\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { createTestNamePattern, escapeRegex, groups };
