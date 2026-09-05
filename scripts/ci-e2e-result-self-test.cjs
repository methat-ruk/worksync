"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const { e2eSucceeded } = require("./ci-e2e-result.cjs");

test("only three successful lanes pass, including every incomplete result combination", () => {
  const results = [
    "success",
    "failure",
    "cancelled",
    "skipped",
    "",
    "unknown",
    undefined
  ];
  for (const compatibility of results) {
    for (const mocked of results) {
      for (const live of results) {
        assert.equal(
          e2eSucceeded([compatibility, mocked, live]),
          compatibility === "success" && mocked === "success" && live === "success"
        );
      }
    }
  }
  for (const invalid of [
    [],
    new Array(3),
    ["success"],
    ["success", "success"],
    ["success", "success", "success", "success"]
  ]) {
    assert.equal(e2eSucceeded(invalid), false);
  }
});

test("the CI entry point preserves the predicate's exit status", () => {
  for (const args of [
    ["success", "success", "success"],
    ["success", "success", "failure"],
    ["success", "skipped", "success"],
    []
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, "ci-e2e-result.cjs"), ...args],
      { encoding: "utf8" }
    );
    assert.ifError(result.error);
    assert.equal(result.status, e2eSucceeded(args) ? 0 : 1);
  }
});
