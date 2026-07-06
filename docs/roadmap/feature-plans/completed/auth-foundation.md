# Completed Feature Plan: Auth Foundation

Status: Done

## Delivered

- password signup and login
- email normalization
- password hashing
- JWT access tokens
- auth guard and current-user contract
- `/api/auth/me`
- DTO validation
- Swagger docs
- integration, contract, and security tests

## Key Decisions

- `passwordHash` is nullable to support provider-only users
- password login requires a password hash
- public user contracts never include password hashes
- unknown email and wrong password return the same client-facing error

## Evidence

- backend unit, integration, contract, and security tests
- Prisma migration validation
- typecheck, lint, and build

## Known Follow-up

- account lifecycle features such as email verification and reset password
- profile/security account pages
