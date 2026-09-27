# API power and signed integration webhooks

Account → API tokens now offers **Start, stop and restart servers**, adding `servers.power` and `operations.read`. The owner must currently hold `server.power` on every chosen server. Existing tokens gain no new scope.

`POST /api/v1/servers/{fleet-uuid}/power` takes `{"action":"start"}`, `stop` or `restart`, a bearer API token and an `Idempotency-Key` (16–128 ASCII letters, digits, `_`, `-`). See [OpenAPI](openapi-v1.json). Admission is persisted before dispatch. Reusing the same token/key/body returns the recorded operation, never another restart. A different body with that key returns 409. Power and backup requests share the key namespace, with distinct fingerprints.

The request returns immediately while power dispatch runs in the background (up to 120 seconds to the agent). 202 includes `data.id`, `serverId`, `action`, `status` (initially `dispatching`) and `createdAt`, plus a Location pointing to `GET /api/v1/operations/{id}`. A confirmed power command is `completed`; it does not guarantee A2S/game readiness. A lost agent response or interrupted dispatch becomes `uncertain` (409). Inspect Activity and current game state before using another key. The agent has its own durable idempotency journal. The API uses the same power implementation, port checks, pending configuration and mutation locks as the console, through a capability delegated to exactly one runtime. The bearer token is never forwarded.

## Signed receiver

Panel Settings → **Signed integration webhook** is separate from Discord. It is disabled until a root administrator configures an HTTPS receiver. A random 256-bit secret appears only after first save or deliberate rotation. Save it at the receiver; the panel stores it encrypted using its existing master secret. Rotation skips pending old deliveries. Disabling or changing the endpoint also skips pending deliveries. A request already in flight may finish.

The root/session-only settings routes are GET/PUT `/api/signed-webhooks` and POST `/api/signed-webhooks/test`. Saving requires the displayed revision; stale updates return 409. No API bearer token can manage this configuration. No receiver has been configured by this implementation, and no user webhook is assumed to accept this custom format.

Payload:

```json
{"id":"event-id","type":"server.power","createdAt":"2026-09-26T20:00:00.000Z","data":{"serverId":"fleet-uuid","action":"restart","status":"completed"}}
```

Events: `server.power` for fresh API power dispatch outcomes; `alert.game`, `alert.node`, `alert.backup`, `alert.schedule`, `alert.recovery`, `alert.storage` for existing alert transitions; `webhook.test` for an explicit test. Alert data has only title and source. Game logs, commands, credentials and detailed errors are excluded. Discord delivery state is independent. Event capture is not an atomic transaction with the power command; an abrupt crash before enqueue can lose its notification. Query the operation record for authoritative status. Backup success events and UI-originated power events are not emitted by this version.

Headers:

- `X-Eserv-Event-Id`: stable event ID, also in body.
- `X-Eserv-Timestamp`: Unix seconds for this attempt.
- `X-Eserv-Signature`: `v1=` followed by lowercase HMAC-SHA256 hex over `timestamp + "." + rawBody`, using the signing secret.

Verify the signature against **raw request bytes** with a constant-time comparison before parsing or processing. Reject timestamps outside ±5 minutes, keep clocks synchronized, and durably deduplicate the event ID. A retry has the same ID/body with a fresh timestamp/signature. Return 2xx after durably accepting it. This is at-least-once delivery: network timeouts may occur after acceptance.

The durable queue retries network failures, HTTP 429 and 5xx up to five attempts within 24 hours, with backoff. Other responses, including redirects, fail without following a Location header. Restart requeues in-flight deliveries. History shows only IDs, times, attempts and HTTP outcomes; retention is seven days and approximately 10,000 completed records, with at most 1,000 pending events (new events beyond that queue cap are not admitted).

Only public HTTPS addresses on port 443 are allowed, without credentials, query strings or fragments. Every attempt resolves DNS, rejects private/reserved answers and pins a validated address for the TLS request. TLS certificate validation stays enabled. DNS has a five-second deadline; request has eight seconds. Response bodies are not retained.

## Verification

HTTP tests cover lost responses, stable replay, scope/current-permission loss and changed runtime identity. Webhook tests cover signature bytes, DNS pinning/private-address denial, redirects, encrypted secrets, retries, restart and rotation. UI tests cover explicit scopes, one-time secrets and mobile layout. The game rehearsal runs scoped power start/stop/restart on an isolated restored copy, keeping the original live game untouched.

Database additions are `api_operations.kind`, `signed_webhook_config` and `signed_webhook_events`. Preserve operation journals during rollback; restoring an old database can erase deduplication history. Before rolling code back past `servers.power`, revoke tokens carrying that new scope (older code rejects unknown scopes). Disable signed webhooks before reverting to a build without the worker.
