import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { isHttpEndpointReady } from "./health-probe.mjs";

let server;
let baseUrl;

before(async () => {
  server = createServer((request, response) => {
    if (request.url === "/ready") {
      response.writeHead(200).end("ok");
    }
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("returns true when the endpoint responds successfully", async () => {
  assert.equal(await isHttpEndpointReady(`${baseUrl}/ready`), true);
});

test("returns false within the request timeout when the endpoint never responds", async () => {
  const startedAt = performance.now();

  assert.equal(
    await isHttpEndpointReady(`${baseUrl}/never-responds`, {
      timeoutMs: 50
    }),
    false
  );

  assert.ok(
    performance.now() - startedAt < 1_000,
    "health probe exceeded its bounded request timeout"
  );
});
