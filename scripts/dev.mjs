import { spawn } from "node:child_process";
import path from "node:path";

const commands = [
  ["frontend", ["pnpm", "--filter", "@worksync/frontend", "dev"]],
  ["backend", ["pnpm", "--filter", "@worksync/backend", "dev"]]
];
const options = process.argv.slice(2);
if (options.some((option) => option !== "--with-worker")) {
  throw new Error("Usage: pnpm dev [--with-worker]");
}
if (options.includes("--with-worker")) {
  commands.push(["worker", ["pnpm", "--filter", "@worksync/backend", "dev:worker"]]);
}
const corepackScript = path.join(
  path.dirname(process.execPath),
  "node_modules",
  "corepack",
  "dist",
  "corepack.js"
);

let stopping = false;
let exitCode = 0;
let remaining = commands.length;
let shutdownDeadline;
const children = commands.map(([name, command]) => {
  const child =
    process.platform === "win32"
      ? spawn(process.execPath, [corepackScript, ...command], {
          stdio: "inherit"
        })
      : spawn("corepack", command, { stdio: "inherit", detached: true });

  child.on("exit", (code, signal) => {
    remaining--;
    if (stopping) {
      if (remaining === 0) {
        clearTimeout(shutdownDeadline);
        process.exitCode = exitCode;
      }
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
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32") child.kill("SIGTERM");
      else {
        try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
      }
    }
  }
  shutdownDeadline = setTimeout(() => {
    for (const child of children) {
      if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
      }
    }
    process.exit(1);
  }, 40000);
  if (remaining === 0) { clearTimeout(shutdownDeadline); process.exitCode = exitCode; }
}

process.once("SIGINT", () => {
  exitCode = 0;
  stop();
});
process.once("SIGTERM", () => {
  exitCode = 0;
  stop();
});
