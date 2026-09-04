#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const version = "2.5.1";
// SHA-256 digests from google/osv-scanner's v2.5.1 release assets.
const assets = {
  "linux-x64": ["linux_amd64", "f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be"],
  "linux-arm64": ["linux_arm64", "3d0f5aa5a6baa8eb32bcef247388e149ef6030a6634ccae6fa0d62681fb27a6d"],
  "darwin-x64": ["darwin_amd64", "9f89beb6c3d784893cb1cae0a3d56c529bfe91075418c2f9440c45b79654198b"],
  "darwin-arm64": ["darwin_arm64", "75c44d6332f892a1e56286f4105a98ed751ae28d215ca0a8b65cc00d84103054"],
};

function scannerAsset() {
  const asset = assets[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error("Unsupported OSV platform; use the Linux CI gate.");
  return { name: `osv-scanner_${asset[0]}`, sha256: asset[1] };
}

function scannerPath() {
  return path.resolve(__dirname, "../node_modules/.cache/osv-scanner", version, scannerAsset().name);
}

function verifyBinary(bytes, expected = scannerAsset().sha256) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error("OSV-Scanner checksum mismatch; refusing to execute.");
  }
}

async function setup() {
  const target = scannerPath();
  if (fs.existsSync(target)) {
    verifyBinary(fs.readFileSync(target));
  } else {
    const response = await fetch(
      `https://github.com/google/osv-scanner/releases/download/v${version}/${scannerAsset().name}`,
      { signal: AbortSignal.timeout(60_000) },
    );
    if (!response.ok) throw new Error(`OSV download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyBinary(bytes);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o755 });
  }
  console.log(`OSV-Scanner ${version} verified: ${target}`);
}

if (require.main === module) {
  setup().catch((error) => { console.error(error.message); process.exitCode = 2; });
}

module.exports = { version, scannerPath, verifyBinary };
