#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SURFACES = [
  {
    id: "auth-security",
    label: "Authentication, authorization, session, secret, or abuse-control surface",
    pathPatterns: [
      /(^|\/)auth(\/|\.|$)/i,
      /session/i,
      /cookie/i,
      /token/i,
      /credential/i,
      /oauth/i,
      /rate-?limit/i,
      /security/i,
      /tenant/i,
      /authorization/i,
      /permission/i,
    ],
    evidence: ["security", "backend"],
  },
  {
    id: "database",
    label: "Database, Prisma, migration, generated-client, or data-interpretation surface",
    pathPatterns: [
      /(^|\/)prisma(\/|\.|$)/i,
      /migration/i,
      /schema\.prisma$/i,
      /seed/i,
      /generated\/prisma/i,
    ],
    evidence: ["migration"],
  },
  {
    id: "api-contract",
    label: "Public API contract, DTO, controller, Swagger/OpenAPI, or generated-client surface",
    pathPatterns: [
      /controller\.ts$/i,
      /(^|\/)dto(\/|\.|$)/i,
      /swagger/i,
      /openapi/i,
      /api-design/i,
      /api-client/i,
      /contract/i,
    ],
    evidence: ["contract"],
  },
  {
    id: "runtime-delivery",
    label: "Runtime, Docker, CI/CD, environment, artifact, or deployment surface",
    pathPatterns: [
      /^\.github\//i,
      /^docker\//i,
      /Dockerfile$/i,
      /compose/i,
      /(^|\/)\.env.*example$/i,
      /artifact/i,
      /deployment/i,
      /(^|\/)ci(\/|\.|$)/i,
      /^\.github\/workflows\//i,
      /(^|\/)package\.json$/i,
    ],
    evidence: ["runtime"],
  },
  {
    id: "dependency",
    label: "Dependency, lockfile, package manager, or supply-chain surface",
    pathPatterns: [
      /(^|\/)pnpm-lock\.yaml$/i,
      /(^|\/)pnpm-workspace\.yaml$/i,
      /(^|\/)npm-shrinkwrap\.json$/i,
      /(^|\/)yarn\.lock$/i,
    ],
    evidence: ["dependency"],
  },
  {
    id: "frontend-runtime",
    label: "Frontend UI, route, form, async state, accessibility, or browser behavior surface",
    pathPatterns: [/^app\/frontend\/src\//i, /^app\/frontend\/e2e\//i],
    evidence: ["frontend"],
  },
  {
    id: "backend-behavior",
    label: "Backend behavior, service, job, handler, or test surface",
    pathPatterns: [/^app\/backend\/src\//i, /^app\/backend\/test\//i],
    evidence: ["backend"],
  },
  {
    id: "documentation",
    label: "Documentation, setup, or workflow surface",
    pathPatterns: [/^docs\//i, /^README\.md$/i, /\.md$/i],
    evidence: ["docs"],
  },
];

const EVIDENCE_PATTERNS = {
  backend: [
    /\bpnpm\s+validate:backend\b/i,
    /\bbackend\b.*\b(test|jest|unit|integration|contract|security|build|lint|typecheck)\b/i,
    /\b(test:unit|test:integration|test:contract|test:security)\b/i,
    /\bjest\b/i,
  ],
  frontend: [
    /\bpnpm\s+validate:frontend\b/i,
    /\bfrontend\b.*\b(test|vitest|playwright|e2e|browser|build|lint|typecheck)\b/i,
    /\bplaywright\b/i,
    /\be2e\b/i,
    /\bbrowser evidence\b/i,
    /\baccessibility\b/i,
    /\bscreenshot\b/i,
  ],
  contract: [
    /\bcontract\b/i,
    /\bopenapi\b/i,
    /\bswagger\b/i,
    /\bstatus code\b/i,
    /\bresponse envelope\b/i,
    /\bgenerated client\b/i,
    /\bconsumer compatibility\b/i,
  ],
  security: [
    /\bsecurity\b/i,
    /\babuse\b/i,
    /\bnegative\b/i,
    /\blog leakage\b/i,
    /\bredact/i,
    /\bauthorization\b/i,
    /\bauthentication\b/i,
    /\btenant\b/i,
    /\bidor\b/i,
    /\bbola\b/i,
    /\brate[- ]?limit/i,
  ],
  migration: [
    /\bprisma\b/i,
    /\bmigration\b/i,
    /\bmigrate\b/i,
    /\bdatabase\b/i,
    /\bdata[- ]?shape\b/i,
    /\brollback\b/i,
    /\bforward[- ]?fix\b/i,
  ],
  runtime: [
    /\bdocker\b/i,
    /\bcompose\b/i,
    /\bci\b/i,
    /\bruntime\b/i,
    /\bsmoke\b/i,
    /\bartifact\b/i,
    /\benv(ironment)?\b/i,
    /\bbuild\b/i,
  ],
  dependency: [
    /\baudit\b/i,
    /\bpnpm\s+audit\b/i,
    /\blockfile\b/i,
    /\bdependency\b/i,
    /\bsupply[- ]?chain\b/i,
  ],
  docs: [/\blink\b/i, /\bdocs?\b/i, /\breadme\b/i, /\bsetup\b/i],
};

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    return {};
  }
  return readJson(eventPath);
}

function getPrBody(event) {
  if (process.env.PR_REVIEW_BODY) {
    return process.env.PR_REVIEW_BODY;
  }
  if (process.env.PR_REVIEW_BODY_FILE) {
    return fs.readFileSync(process.env.PR_REVIEW_BODY_FILE, "utf8");
  }
  return event.pull_request?.body || "";
}

function getChangedFiles(event) {
  if (process.env.PR_REVIEW_CHANGED_FILES) {
    return splitFileList(process.env.PR_REVIEW_CHANGED_FILES);
  }

  const explicitFilesIndex = process.argv.indexOf("--files");
  if (explicitFilesIndex !== -1 && process.argv[explicitFilesIndex + 1]) {
    return splitFileList(fs.readFileSync(process.argv[explicitFilesIndex + 1], "utf8"));
  }

  const baseSha = event.pull_request?.base?.sha;
  if (baseSha) {
    return splitFileList(runGit(["diff", "--name-only", "--diff-filter=ACMRT", `${baseSha}...HEAD`]));
  }

  const baseArgIndex = process.argv.indexOf("--base");
  if (baseArgIndex !== -1 && process.argv[baseArgIndex + 1]) {
    return splitFileList(runGit(["diff", "--name-only", "--diff-filter=ACMRT", `${process.argv[baseArgIndex + 1]}...HEAD`]));
  }

  const localDiff = runGit(["diff", "--name-only", "--diff-filter=ACMRT", "HEAD"]);
  const stagedDiff = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]);
  const untrackedFiles = runGit(["ls-files", "--others", "--exclude-standard"]);
  return splitFileList(`${localDiff}\n${stagedDiff}\n${untrackedFiles}`);
}

function splitFileList(value) {
  return [...new Set(value.split(/[\r\n,]+/).map((item) => normalizePath(item.trim())).filter(Boolean))];
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function classify(files) {
  const matched = new Map();

  for (const surface of SURFACES) {
    const matchedFiles = files.filter((file) =>
      surface.pathPatterns.some((pattern) => pattern.test(file)),
    );
    if (matchedFiles.length > 0) {
      matched.set(surface.id, { ...surface, files: matchedFiles });
    }
  }

  return [...matched.values()];
}

function hasEvidence(body, key) {
  return EVIDENCE_PATTERNS[key].some((pattern) => pattern.test(body));
}

function getEvidenceCorpus(body) {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*-\s*\[\s\]/.test(line))
    .join("\n");
}

function analyzeEvidence(surfaces, body) {
  const evidenceCorpus = getEvidenceCorpus(body);
  const required = [...new Set(surfaces.flatMap((surface) => surface.evidence))];
  const detected = required.filter((key) => hasEvidence(evidenceCorpus, key));
  const missing = required.filter((key) => !detected.includes(key));

  return { required, detected, missing };
}

function markdownList(items) {
  if (items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function surfaceSummary(surfaces) {
  if (surfaces.length === 0) {
    return "- None";
  }

  return surfaces
    .map((surface) => {
      const files = surface.files.slice(0, 6).map((file) => `  - ${file}`).join("\n");
      const overflow = surface.files.length > 6 ? `\n  - ...and ${surface.files.length - 6} more` : "";
      return `- ${surface.label}\n${files}${overflow}`;
    })
    .join("\n");
}

function buildReport({ files, surfaces, evidence, body }) {
  const advisoryNotes = [
    "This advisory check is deterministic and based on changed paths plus optional PR body evidence text.",
    "Missing evidence here does not fail CI; reviewers should use it to ask better questions.",
    "This check does not approve, merge, push, close, or comment on the PR.",
  ];

  if (body.trim().length === 0 && evidence.required.length > 0) {
    advisoryNotes.unshift("No PR body evidence was provided; review the expected evidence list manually.");
  }

  return {
    markdown: `# PR Review Evidence\n\n` +
      `## Changed files\n\n${markdownList(files)}\n\n` +
      `## Changed surfaces\n\n${surfaceSummary(surfaces)}\n\n` +
      `## Required evidence\n\n${markdownList(evidence.required)}\n\n` +
      `## Detected evidence\n\n${markdownList(evidence.detected)}\n\n` +
      `## Missing evidence\n\n${markdownList(evidence.missing)}\n\n` +
      `## Blocking guards\n\n- None; this check is advisory-first.\n\n` +
      `## Advisory notes\n\n` +
      `${markdownList(advisoryNotes)}\n`,
  };
}

function main() {
  const event = getEvent();
  const body = getPrBody(event);
  const files = getChangedFiles(event);
  const surfaces = classify(files);
  const evidence = analyzeEvidence(surfaces, body);
  const report = buildReport({ files, surfaces, evidence, body });

  console.log(report.markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report.markdown}\n`);
  }
}

main();
