"use strict";

function e2eSucceeded(results) {
  return (
    results.length === 3 &&
    results[0] === "success" &&
    results[1] === "success" &&
    results[2] === "success"
  );
}

if (require.main === module) {
  if (!e2eSucceeded(process.argv.slice(2))) {
    process.stderr.write("Every E2E lane must succeed; incomplete results cannot pass.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Compatibility, mocked, and live E2E lanes passed.\n");
  }
}

module.exports = { e2eSucceeded };
