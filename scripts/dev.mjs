import { spawn } from "node:child_process";
import path from "node:path";

const commands = [
  ["frontend", ["pnpm", "--filter", "@worksync/frontend", "dev"]],
  ["backend", ["pnpm", "--filter", "@worksync/backend", "dev"]]
];
const corepackScript = path.join(
  path.dirname(process.execPath),
  "node_modules",
  "corepack",
  "dist",
  "corepack.js"
);

let stopping = false;
let exitCode = 0;
const children = commands.map(([name, command]) => {
  const child =
    process.platform === "win32"
      ? spawn(process.execPath, [corepackScript, ...command], {
          stdio: "inherit"
        })
      : spawn("corepack", command, { stdio: "inherit" });

  child.on("exit", (code, signal) => {
    if (stopping) {
      return;
    }
    if (signal === "SIGINT" || code === 130) {
      exitCode = 0;
      stop();
      return;
    }
    exitCode = code === 0 ? 1 : (code ?? 1);
    process.stderr.write(
      `${name} development server stopped unexpectedly.\n`
    );
    stop();
  });

  return child;
});

function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(exitCode), 250).unref();
}

process.once("SIGINT", () => {
  exitCode = 0;
  stop();
});
process.once("SIGTERM", () => {
  exitCode = 0;
  stop();
});
