# PR Review Automation Workflow

WorkSync uses lightweight PR review automation to make changed surfaces and
expected evidence visible before merge. The automation is advisory-first: it
supports review without forcing every pull request to fill out a long template.

## Components

- `scripts/pr-review-evidence.cjs` classifies changed files into review
  surfaces and reports expected evidence.
- `scripts/pr-review-evidence-self-test.cjs` verifies core advisory behavior
  for the evidence checker.
- `.github/workflows/ci.yml` runs the `PR review evidence` job on pull requests.

## How the Check Works

The evidence check reads:

1. changed files from the pull request diff
2. optional pull request body text from the GitHub event payload
3. keyword evidence from the PR body when present

It then reports:

- changed files
- changed surfaces
- required evidence
- detected evidence
- missing evidence
- advisory notes

Missing evidence does not fail CI by itself. The checker should fail only when
the checker itself is broken. Reviewers use the report to ask for evidence when
the changed surface warrants it.

## Review Surfaces

These surfaces produce expected-evidence reminders:

- authentication, authorization, sessions, cookies, tokens, tenant isolation,
  secrets, or abuse controls
- database, Prisma, migrations, generated Prisma client, or data interpretation
- public API contracts, DTOs, controllers, Swagger/OpenAPI, or generated clients
- runtime, Docker, CI/CD, environment examples, artifacts, or deployment behavior
- dependencies, lockfiles, package-manager behavior, or supply-chain surfaces
- frontend runtime behavior
- backend runtime behavior

Documentation-only changes are advisory unless they also touch a higher-risk
surface.

## Local Usage

Run the checker against local unstaged/staged changes:

```bash
pnpm pr:review:evidence
```

Run the checker regression self-test:

```bash
pnpm pr:review:evidence:self-test
```

Run against a base branch:

```bash
node scripts/pr-review-evidence.cjs --base origin/main
```

Run against a file list:

```bash
node scripts/pr-review-evidence.cjs --files changed-files.txt
```

## Useful Evidence Notes

If a PR is risky, add concrete commands or evidence names in the PR description
or review summary, for example:

```txt
pnpm validate:backend
pnpm validate:frontend
pnpm --filter @worksync/frontend test:e2e
Prisma migrate deploy/status against worksync_test
Swagger/OpenAPI contract checked
Docker compose config --quiet
pnpm audit --prod --audit-level moderate
```

If a check was skipped, state why and what risk remains. This is not required
for every tiny PR, but it is useful for auth, data, API contract, runtime, and
security-sensitive changes.

## Safety Boundaries

- The check does not approve, merge, push, close, or comment on a PR.
- The check does not use secrets.
- The check does not run destructive commands.
- The check may miss evidence that was not written in recognizable terms; treat
  the output as a review aid, not merge authority.
