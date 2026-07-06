# Errors and Operational Endpoints

This file owns public error shape, correlation behavior, and operational
endpoint contracts.

## Error Shape

Errors should be useful without leaking internals:

```ts
{
  success: false;
  message: string;
  data?: {
    code?: string;
    fields?: Record<string, string[]>;
    correlationId?: string;
  }
}
```

Do not expose stack traces, raw database errors, secrets, tokens, provider
payloads, or internal infrastructure details.

Public error codes must be registered in the shared backend error-code registry
before use. Runtime normalization and Swagger documentation use the shared API
error DTO so feature modules do not define competing error envelopes.

Every HTTP response includes `x-correlation-id`. A valid incoming
`x-correlation-id` is preserved; otherwise the backend generates one. Error
responses include the same identifier in `data.correlationId` when request
context is available.

## Operational Endpoints

- `GET /health` remains the compatibility liveness endpoint.
- `GET /health/live` reports process liveness without checking dependencies.
- `GET /health/ready` verifies PostgreSQL connectivity and returns `503` with
  code `SERVICE_NOT_READY` when the backend cannot serve database-backed work.
