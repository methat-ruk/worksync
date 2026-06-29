# WorkSync Workflow Docs

This folder explains how important WorkSync engineering workflows fit together.
Use it when you need to understand how a part of the project operates before
changing it.

These documents are intentionally split by workflow. Keep project-specific
facts here, and keep reusable engineering rules in external skills or team
playbooks.

## Workflow Map

| Workflow | When to read it |
| --- | --- |
| [CI Validation Workflow](ci-validation-workflow.md) | CI is failing, validation commands change, or required evidence is unclear |
| [Docker Workflow](docker-workflow.md) | Local run modes, Compose topology, ports, or images change |
| [Database and Prisma Workflow](database-prisma-workflow.md) | Prisma schema, migrations, generated client, or database tests change |
| [Auth Workflow](auth-workflow.md) | Authentication, sessions, OAuth, cookies, tokens, or auth abuse controls change |
| [Frontend and Backend API Workflow](frontend-backend-api-workflow.md) | Frontend API calls, response contracts, route guards, or auth UI behavior change |

## How to Use These Docs

1. Start with the workflow that owns the changed surface.
2. Check the high-level flow before editing code.
3. Run the validation commands that match the change.
4. Update the workflow doc when project behavior, topology, commands, or
   evidence requirements change.

## What Belongs Here

Put project-specific operating knowledge here:

- WorkSync run modes and hostnames
- WorkSync validation commands
- WorkSync auth/session behavior
- WorkSync CI job ownership
- WorkSync Prisma and Docker gotchas

Do not put reusable engineering principles here. Reusable guidance belongs in
the engineering skills or team-level playbooks.
