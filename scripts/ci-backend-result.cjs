"use strict";

function backendSucceeded(results) {
  return (
    results.length === 2 &&
    results[0] === "success" &&
    results[1] === "success"
  );
}

if (require.main === module) {
  if (!backendSucceeded(process.argv.slice(2))) {
    process.stderr.write(
      "Backend quality and every service-test shard must succeed.\n"
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Backend quality and service-test shards passed.\n");
  }
}

module.exports = { backendSucceeded };
