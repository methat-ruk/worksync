import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { __unstable__loadDesignSystem } from "tailwindcss";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sourceRoot = path.join(frontendRoot, "src");

export function extractAtRuleBlock(source, directive) {
  const start = source.indexOf(directive);
  const openingBrace = source.indexOf("{", start);

  if (start < 0 || openingBrace < 0) {
    throw new Error(`Missing ${directive} block`);
  }

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unclosed ${directive} block`);
}

async function collectSourceFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

export async function loadProjectDesignSystem() {
  const [defaultTheme, globals] = await Promise.all([
    fs.readFile(
      path.join(frontendRoot, "node_modules", "tailwindcss", "theme.css"),
      "utf8"
    ),
    fs.readFile(path.join(sourceRoot, "app", "globals.css"), "utf8")
  ]);
  const projectTheme = extractAtRuleBlock(globals, "@theme inline");

  // Tailwind does not expose a stable canonicalization API. Keep the unstable
  // dependency isolated here and protect its expected behavior with fixtures.
  return __unstable__loadDesignSystem(`${defaultTheme}\n${projectTheme}`);
}

export function findCanonicalClassFindings(source, file, designSystem) {
  const findings = [];
  const stringLiterals = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

  for (const match of source.matchAll(stringLiterals)) {
    const value = match[2];
    let searchOffset = 0;

    for (const candidate of value.split(/\s+/).filter(Boolean)) {
      const candidateOffset = value.indexOf(candidate, searchOffset);
      searchOffset = candidateOffset + candidate.length;
      const canonical = designSystem.canonicalizeCandidates([candidate], {
        rem: 16
      })[0];

      if (
        canonical !== candidate &&
        designSystem.candidatesToCss([candidate])[0] !== null
      ) {
        const absoluteOffset = (match.index ?? 0) + 1 + candidateOffset;
        findings.push({
          candidate,
          canonical,
          file,
          line: lineAt(source, absoluteOffset)
        });
      }
    }
  }

  return findings;
}

async function main() {
  const designSystem = await loadProjectDesignSystem();
  const findings = [];

  for (const file of await collectSourceFiles(sourceRoot)) {
    const source = await fs.readFile(file, "utf8");
    findings.push(
      ...findCanonicalClassFindings(
        source,
        path.relative(frontendRoot, file),
        designSystem
      )
    );
  }

  if (findings.length > 0) {
    console.error("Use canonical Tailwind classes:");
    for (const finding of findings) {
      console.error(
        `- ${finding.file}:${finding.line} ${finding.candidate} -> ${finding.canonical}`
      );
    }
    process.exitCode = 1;
  } else {
    console.log("Canonical Tailwind class check passed");
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  await main();
}
