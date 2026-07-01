#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const checkerPath = path.join(__dirname, "pr-review-evidence.cjs");

function runCase(name, env, expectedStatus, expectedOutput) {
  const result = spawnSync(process.execPath, [checkerPath], {
    env: {
      ...process.env,
      ...env,
      GITHUB_EVENT_PATH: "",
      GITHUB_STEP_SUMMARY: "",
    },
    encoding: "utf8",
  });

  if (result.status !== expectedStatus) {
    throw new Error(
      `${name}: expected exit ${expectedStatus}, got ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }

  for (const expected of expectedOutput) {
    if (!result.stdout.includes(expected)) {
      throw new Error(`${name}: missing output "${expected}"\n${result.stdout}`);
    }
  }
}

runCase(
  "runtime docs pass",
  {
    PR_REVIEW_CHANGED_FILES:
      ".github/workflows/ci.yml\ndocs/workflows/pr-review-automation.md",
    PR_REVIEW_BODY:
      "Runtime evidence: CI workflow review completed. Documentation evidence: docs link checked.",
  },
  0,
  ["Detected evidence", "- runtime", "- docs", "Blocking guards\n\n- None"],
);

runCase(
  "docs workflow path is documentation only",
  {
    PR_REVIEW_CHANGED_FILES: "docs/workflows/pr-review-automation.md",
    PR_REVIEW_BODY: "",
  },
  0,
  [
    "Documentation, setup, or workflow surface",
    "Required evidence\n\n- docs",
    "Missing evidence\n\n- docs",
  ],
);

runCase(
  "package script change is runtime tooling by default",
  {
    PR_REVIEW_CHANGED_FILES: "package.json",
    PR_REVIEW_BODY: "",
  },
  0,
  [
    "Runtime, Docker, CI/CD, environment, artifact, or deployment surface",
    "Required evidence\n\n- runtime",
  ],
);

runCase(
  "lockfile change is dependency evidence",
  {
    PR_REVIEW_CHANGED_FILES: "pnpm-lock.yaml",
    PR_REVIEW_BODY: "",
  },
  0,
  [
    "Dependency, lockfile, package manager, or supply-chain surface",
    "Required evidence\n\n- dependency",
  ],
);

runCase(
  "auth missing evidence warns without failing",
  {
    PR_REVIEW_CHANGED_FILES: "app/backend/src/auth/auth.controller.ts",
    PR_REVIEW_BODY: "Summary only.",
  },
  0,
  [
    "Missing evidence",
    "- security",
    "- backend",
    "- contract",
    "Blocking guards\n\n- None; this check is advisory-first.",
  ],
);

runCase(
  "empty PR body warns without failing",
  {
    PR_REVIEW_CHANGED_FILES: "app/backend/src/auth/auth.controller.ts",
    PR_REVIEW_BODY: "",
  },
  0,
  [
    "Detected evidence\n\n- None",
    "No PR body evidence was provided; review the expected evidence list manually.",
  ],
);

console.log("pr-review-evidence self-test passed");
