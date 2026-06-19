const { existsSync, readdirSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const backendDist = join(repositoryRoot, "app", "backend", "dist");

function requirePath(path, description) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${description}: ${relative(repositoryRoot, path)}`);
  }
}

function rejectPath(path, description) {
  if (existsSync(path)) {
    throw new Error(
      `Unexpected ${description}: ${relative(repositoryRoot, path)}`
    );
  }
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

requirePath(join(backendDist, "main.js"), "backend runtime entrypoint");
requirePath(
  join(backendDist, "generated", "prisma", "client.js"),
  "compiled Prisma client"
);
rejectPath(join(backendDist, "test"), "compiled test directory");
rejectPath(
  join(backendDist, "src", "main.js"),
  "nested backend runtime entrypoint"
);

const sourceMaps = collectFiles(backendDist).filter((path) =>
  path.endsWith(".js.map")
);
if (sourceMaps.length === 0) {
  throw new Error("Backend artifact does not contain source maps");
}

process.stdout.write(
  `Backend artifact validated (${collectFiles(backendDist).length} files)\n`
);
