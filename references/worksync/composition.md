# WorkSync Composition Rules

## Precedence

Apply instructions in this order:

1. system and safety constraints
2. configured developer workflow or local environment instructions
3. WorkSync project profile
4. task-specific requirements

The project profile specializes generic terms but does not weaken security, validation, data-integrity, or release controls.

## Abstraction Mapping

When reusable engineering guidance uses generic terms, map them to WorkSync as
follows:

- Web Framework -> Next.js App Router
- Backend Framework -> NestJS
- ORM / Data Access Layer -> Prisma
- Relational Database -> PostgreSQL
- Cache Layer -> Redis
- Queue System -> BullMQ
- Realtime Transport -> Socket.IO
- Object Storage -> S3-compatible storage; MinIO locally; AWS S3 production target
- AI / LLM Feature -> load WorkSync stack, architecture, testing, and workflow
  profile files when project-specific constraints matter
- Issue Tracking System -> the team-configured tracker
- Browser Automation Tool -> Playwright
- Exploratory / Generated Test Tool -> TestSprite when configured

## Routing

Use the configured developer workflow for the current environment, then load
only WorkSync profile files relevant to the work.

Project facts belong in this profile. Reusable procedures should not be required
by this profile unless they are committed as shared project documentation.
