"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const { backendSucceeded } = require("./ci-backend-result.cjs");

test("only exact success from both backend lanes passes", () => {
  const results = [
    "success",
    "failure",
    "cancelled",
    "skipped",
    "",
    "unknown",
    undefined
  ];
  for (const quality of results) {
    for (const services of results) {
      assert.equal(
        backendSucceeded([quality, services]),
        quality === "success" && services === "success"
      );
    }
  }
  for (const invalid of [
    [],
    new Array(2),
    ["success"],
    ["success", "success", "success"]
  ]) {
    assert.equal(backendSucceeded(invalid), false);
  }
});

test("the CI entry point preserves the predicate's exit status", () => {
  for (const args of [
    ["success", "success"],
    ["success", "failure"],
    ["skipped", "success"],
    []
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, "ci-backend-result.cjs"), ...args],
      { encoding: "utf8" }
    );
    assert.ifError(result.error);
    assert.equal(result.status, backendSucceeded(args) ? 0 : 1);
  }
});
