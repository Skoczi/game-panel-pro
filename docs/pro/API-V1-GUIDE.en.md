# API v1 integration guide

Base URL: `https://panel.example.com/api/v1`. [OpenAPI](openapi-v1.json) · [English PDF](../api/game-panel-pro-api-v1-en.pdf) · [Polski](API-V1-GUIDE.md).

## Authentication

Create a token in **Account → API tokens**, choosing servers and scopes. The secret is displayed once. Send `Authorization: Bearer <token>`; never put it in URLs or source control. Current owner permissions and account status are checked on every request. Administrative scopes require a panel administrator.

Provisioning also requires an **Install servers** policy: allowed nodes/templates, per-server CPU/memory limits and a creation budget. Failed and uncertain admissions consume that budget; deleting a server does not replenish it. A successfully created server is assigned to its originating token.

## Inventory and details

`GET /servers` and `GET /servers/{id}` require `servers.read`. UUID `id` is canonical; `number` is the global server number. All server paths accept either. List sorting defaults to `id`; `sort=number|name|address` is optional. Address sorting compares IP addresses and ports numerically.

Filters: `search`, `status`, `game` (catalog ID), `node` (UUID or `local`). Pagination: `limit=1..100`, default 50; pass `nextCursor` as `after` while keeping filters and sort unchanged. On `invalid_cursor`, start again. This is a changing inventory, not a frozen snapshot.

Responses include identity, placement, ports, template, limits, desired state, uptime, installation progress, game response, capabilities and links. Details query the runtime; the list uses periodic inventory. `available=false`, `stale=true`, `status=unknown` means no fresh confirmation, not a stopped game. `null` means unknown or unsupported, not zero. `resourceUsage` in details requires `resources.read`; `/servers/{id}/resources` returns the latest available sample.

Environment variables, passwords, startup commands, host paths and node keys are not exposed.

## Provision a stopped Native server

1. `GET /templates` (`templates.read`): published Native versions and required variables/ports.
2. `GET /nodes` and `/nodes/{id}/allocations` (`nodes.read`): node choices and allocation pools.
3. `POST /servers/plan` (`servers.create`): validate a complete payload without reserving ports.
4. `POST /servers` with the same payload and a persistent `Idempotency-Key`.
5. Poll `Location`, the operation resource. Installation leaves the game **stopped**.

Illustrative payload; replace every template/node/port/variable choice with API values:

```json
{
  "nodeId": "NODE_UUID",
  "templateId": "TEMPLATE_ID",
  "templateVersion": 2,
  "name": "Community server",
  "resourceLimits": { "cpu": 1, "memoryMb": 1024 },
  "bindings": [{ "key": "game", "hostIp": "192.0.2.10", "host": "auto" }],
  "variables": {}
}
```

Include all required bindings. Linked TCP/UDP bindings share IP and port. `auto` selects from the assigned pool. Creation revalidates and reserves ports under a lock. Server numbers come from the central database.

Keys contain 16-128 letters, digits, hyphens or underscores. Replaying the same key and payload returns the same operation; a different payload with the same key returns 409. Installation keys use a separate namespace from backup/power.

202 confirms admission. 409 with `data.status=uncertain` means an unconfirmed result: keep the key and query the operation. Do not submit a new order to work around a timeout. The panel uses the durable installation identity to reconcile node state and does not automatically redispatch uncertain requests.

Only published Native templates are supported. Legacy provisioning, arbitrary scripts, images, host paths and startup commands are outside this endpoint.

## Power and backups

- `POST /servers/{id}/power`: `servers.power` and owner `server.power`; body `{"action":"start"}`, `stop` or `restart`.
- `GET /servers/{id}/backups`: `backups.read` and owner permission. Sorted by name, `after` is a backup name, limit 1-100. Metadata: name, kind, sizeBytes, modifiedAt.
- `POST /servers/{id}/backups`: `backups.create` and owner permission; Native only. Optional body name, e.g. `{"name":"Before-update"}`.

Power and backup writes require Idempotency-Key and return asynchronous operation references. Power completion confirms the command, not game readiness. Public archive restore/delete/download endpoints are not part of this contract.

## Accounts and memberships

`GET /users` requires `users.read`; `POST /users` requires `users.create`. Both require a panel administrator. Creation accepts username and password and always creates role `user`. Username: 1-12 ASCII letters, digits, dots, underscores or hyphens. Password: 8-128 characters. Duplicate names return 409; reconcile an uncertain creation by listing the unique username.

`GET /servers/{id}/members` returns members and presets. `PUT /servers/{id}/members/{userId}` with `{"preset":"server-admin"}` replaces membership; DELETE removes it. Read/write scopes are `members.read` and `members.write`. These routes require a panel administrator and a server assigned to the token; they do not modify operator/superadmin membership.

| Preset | Access |
| --- | --- |
| viewer | Console output |
| console-operator | Console output, game commands, power |
| server-admin | Above plus files, backups, schedules and SFTP |

No preset grants terminal, CPU/IP/port or startup environment editing. SFTP permission does not expose an API for issuing passwords. Operator creation, account deletion and password reset are not public endpoints.

## AMXX administrators

`GET /servers/{id}/game-admins` returns Steam ID entries and an ETag. Requires `game-admins.read` plus owner `fs.read`.

`PUT /servers/{id}/game-admins/STEAM_0:1:123` with `{"flags":"bcdefiju"}` adds or updates an entry. DELETE removes it. Both require `game-admins.write`, owner file read/write permissions and `If-Match` with the current quoted ETag. Flags contain 1-25 letters a-y. Missing/invalid If-Match returns 428; a stale version returns 409.

Writes create a recovery snapshot and replace the file atomically. Comments and unmanaged entries remain; passwords are not exposed. The adapter does not execute a reload command. This contract covers AMXX on CS 1.6/ReHLDS, not SourceMod or CS2 administrators.

## Operations and errors

`GET /operations` lists this token's admissions, newest first; use `links.self` for current progress. `GET /operations/{id}` requires `operations.read`. Installation results report stage, percent, completion time and a server link.

Success envelopes contain `data` and `requestId`; paginated lists add `nextCursor`. Errors contain `error.code`, `error.message` and `requestId`. Keep request IDs in diagnostic logs. Rate limit: 120 requests/minute/token; 429 supplies Retry-After. API tokens cannot manage tokens.

Public addon/configuration/schedule writes, SFTP password issuance, legacy provisioning, SourceMod/CS2 administrator adapters and multi-recipient integration webhooks remain outside API v1.
