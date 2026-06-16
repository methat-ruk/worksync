# WorkSync Composition Rules

## Precedence

Apply instructions in this order:

1. system and safety constraints
2. reusable skill workflow
3. WorkSync project profile
4. task-specific requirements

The project profile specializes generic terms but does not weaken security, validation, data-integrity, or release controls.

## Abstraction Mapping

When a reusable skill says:

- Web Framework -> Next.js App Router
- Backend Framework -> NestJS
- ORM / Data Access Layer -> Prisma
- Relational Database -> PostgreSQL
- Cache Layer -> Redis
- Queue System -> BullMQ
- Realtime Transport -> Socket.IO
- Object Storage -> AWS S3
- Issue Tracking System -> the team-configured tracker
- Browser Automation Tool -> Playwright
- Exploratory / Generated Test Tool -> TestSprite when configured

## Routing

Read `skills/engineering/execution-order/SKILL.md` first, then load only profile files relevant to the routed work.

Project facts belong in this profile. Reusable procedures belong in `skills/`.
