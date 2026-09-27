# eserv.pl — account levels and server access

## Result

| Account level | Scope | Protected owner account |
| --- | --- | --- |
| Super Admin | Existing owner; all panel capabilities | Cannot be changed through user administration |
| Operator | All nodes, servers, administration, infrastructure, terminal and templates | Cannot delete, disable, rename, reset password or change owner grants |
| User | Explicitly assigned servers and granular permissions | No account administration by default |

Account level is separate from a server permission preset. `Server administrator` grants power, game console/logs, file read/write, backup read/create/download/restore/rename and schedule read/write. It excludes container configuration (CPU/RAM/IP/ports/startup), environment variables, terminal, server deletion and wipes. Settings remain viewable, with infrastructure inputs disabled. The Terminal section is absent. This preset replaces the selected server's permission set; it does not change the account level.

Creation now continues directly into account level and server assignment. No permissions are granted until saved. Operator selection hides irrelevant per-server controls and preserves existing individual assignments for a later downgrade. Viewer no longer grants command sending. The former server-level Operator preset is labelled Infrastructure operator. Permission groups explicitly separate console/power, infrastructure, shell, deletion, files, schedules and backups.

## Findings and fixes

1. The old Operator server preset included `server.edit`, `server.env` and `container.terminal`. It was unsuitable for a game administrator. Added the narrower server preset and separated account-level Operator from server presets.
2. Viewer included `server.command.send`. Removed command execution from Viewer presets; existing grants are not rewritten.
3. Scheduled task write alone allowed shell commands, maintenance updates and other actions whose direct APIs require additional authority. Create and update now authorize each normalized action. Partial updates also authorize the stored task, preventing re-enabling or modifying an existing shell task without terminal access. Restart requires power, backup requires backup creation, commands in all phases require console command access, shell requires terminal, and native template updates require panel administrator authority. UI options and existing task editing follow these controls.
4. Owner protection was already enforced in user API handlers; tests now cover Operator calls for rename, disable, delete, permission changes and password reset. Legacy `users.manage` holders cannot promote themselves to Operator or modify an Operator account.
5. Full panel authority now consistently follows account role across HTTP, JWT issuance, local WebSockets, fleet/node proxy and download authorization, and public API owner checks. Authority is derived from the current database record, not stale JWT claims. HTTP demotion takes effect on the next request; existing WebSocket revalidation handles changed authority.

## Compatibility and live inventory

Read-only FR1 inventory before deployment: Skoczi is the enabled protected owner. Reveres has legacy `server.install` and `users.manage` grants plus full granular access to one fleet server, including terminal and infrastructure editing. No account or membership was changed. The UI marks legacy global combinations as Custom (legacy); selecting User removes global grants, selecting Operator grants full panel authority.

Operator is persisted as the explicit global marker `panel.operator`; no schema migration is required. `users.is_root` remains the immutable owner discriminator. For compatibility, the existing authenticated principal/session `isRoot` flag means full panel authority for both owner and Operator; login/me also return the explicit `role`. The user administration DTO's `isRoot` retains its protected-owner meaning. This distinction is documented in the role helper and covered by tests. Do not use session `isRoot` to decide which target account is protected; inspect the target database row.

## Verification

- Backend build passed; Linux isolated test suite: 265/265.
- Real HTTP/SQLite acceptance: Operator admin and terminal authority, User denial, owner protection, immediate demotion, plus existing login/session/MFA/WebSocket revocation checks passed.
- UI suite: 60 existing checks passed initially; corrected two new test selectors/mocks, then all 7 focused account/permission/maintenance checks passed, including read-only CPU/RAM and hidden terminal. Desktop/mobile account editor inspected; no horizontal overflow at 390px.
- Frontend production build passed, with the existing large Monaco chunk warning.

## Boundaries

This protects account-management operations within the panel. An Operator is a trusted infrastructure administrator, not an untrusted tenant isolated from the panel's host. Writable game files/plugins can execute game code; hiding the terminal does not sandbox plugin code. Previously authorized scheduled jobs remain server automation; changing the creator's role does not automatically delete those jobs. This change prevents unauthorized creation/edit/re-enabling, not retroactive revocation of existing jobs. Existing grants are never silently rewritten.

Deployment uses the existing rollback-capable helpers on FR1, WAW1 and WAW2, with candidate HTTP acceptance and checks that game containers remain unchanged. Deployment result is recorded separately after verification.

## Deployment verified

Released commit `c333c10e1a37add6e607eb4aa40ce1386dcd8e43`, patch `20260927-roles-c333c10`:

- FR1 backend/frontend: candidate HTTP account/session acceptance, nginx and HTTP route/header verification passed; other containers unchanged.
- WAW1 and WAW2 agents: health/identity verification passed; all game containers unchanged.
- Rollback directories: `/opt/gamepanel-pro/local-patches/20260927-roles-c333c10/rollback`, `/srv/eserv-agent/local-patches/20260927-roles-c333c10/rollback`, `/srv/gamepanel-agent/local-patches/20260927-roles-c333c10/rollback`.
- Post-deploy owner and legacy account grants unchanged. WAW2 game remained running with original start timestamp `2026-09-22T15:26:40.006758795Z`.
- No authenticated live-browser session was available; browser checks used fixture accounts, while real authorization checks ran against the candidate image with an isolated SQLite database.
