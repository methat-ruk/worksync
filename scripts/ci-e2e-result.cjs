"use strict";

function e2eSucceeded(results) {
  return results.length === 2 && results[0] === "success" && results[1] === "success";
}

if (require.main === module) {
  if (!e2eSucceeded(process.argv.slice(2))) {
    process.stderr.write("Both E2E lanes must succeed; incomplete results cannot pass.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Compatibility and journey E2E lanes passed.\n");
  }
}

module.exports = { e2eSucceeded };
