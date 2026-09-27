# Game Panel PRO 2.1.0

A complete server workspace, Native provisioning API and coordinated multi-node operations.

## Server workspace

- Shareable URLs for panel pages and file folders, with browser Back/Forward navigation.
- Numeric IP/port fleet sorting and persisted drag ordering in cards and list view.
- Compact mobile actions, aligned server headers/status, contextual file menus and consistent dropdowns.
- Floating action notifications, working console resizing and collapsible log search.
- File copying without destination overwrite, file-operation activity and a cleaner backup history.
- Unified runtime/game status and paginated operational attention in Host Status.

## Games and infrastructure

- Source, CS:GO Legacy, CS2 and HLTV Native templates; Game/RCON bindings share a port and TV is separate.
- Framework management for SourceMod, Metamod, CounterStrikeSharp, SwiftlyS2 and ModSharp with explicit installed state and progress.
- ReHLDS map/admin editors, managed addon install/removal, recovery snapshots and console progress.
- Classic Offensive local-package template and immutable shared content. Game binaries are not included.
- Dedicated-IP per-server SFTP, persistent additional node IPs and unified network allocations.
- Central server numbering, reviewed Native clones/transfers, backup-aware maintenance and monitoring alerts.

## Access and API

- User/operator roles, protected owner, granular server presets and server-admin access without terminal or resource/network editing.
- Authenticator 2FA, local enrollment QR, revocable sessions and bounded login admission.
- API v1 rich inventory, live details, scopes/capabilities, filtering, pagination and templates/node catalogs.
- Planned Native provisioning with durable idempotency and a stopped result, operation tracking, account creation, memberships and ETag-protected AMXX admin writes.
- OpenAPI plus English/Polish API PDFs; signed webhook delivery for supported events.

## Upgrade requirements

Update agents and panel together from a fixed release. Preserve environment files, SQLite state, migration ledger, recovery journals and image identities. Existing game containers are not restarted by the panel upgrade itself.

**2.0.x managed updaters reject 2.1.0.** The first upgrade requires the scripts from the 2.1.0 checkout. The new updater supports stable 2.0.x and 2.1.x versions, compares full version tuples and rejects previews/unreviewed version lines. See [installation](INSTALL.md#upgrade-to-210).

New host networking and SFTP services require node-side configuration. Classic Offensive requires local packages and a prepared runtime image. Neither feature becomes usable solely by updating frontend assets. Existing branding settings are preserved; the new default footer applies to fresh/default configuration.

Do not auto-renumber an existing deployment to match a demonstration server. Global IDs and migrations must preserve existing references. Shared packages remain separate from private backup archives.

## Scope and validation

See [release validation](RELEASE-2.1.0-VALIDATION.md) for exact checks and outstanding acceptance gates. Source/CS2 framework support does not certify every third-party plugin. API SourceMod/CS2 administrator adapters and legacy provisioning are outside this release's public contract.
