"use strict";

function backendSucceeded(results) {
  return (
    results.length === 3 &&
    results[0] === "success" &&
    results[1] === "success" &&
    results[2] === "success"
  );
}

if (require.main === module) {
  if (!backendSucceeded(process.argv.slice(2))) {
    process.stderr.write(
      "Backend quality, every service-test shard, and jobs process tests must succeed.\n"
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Backend quality and service-test shards passed.\n");
  }
}

module.exports = { backendSucceeded };
