# Native server cloning

Root administrators can open a server from Game Servers, then use **Game Config → Clone server**. This supports the same node or another enrolled agent and Native templates with one `data` mount at `/data`. A pending settings change must be applied or discarded before cloning.

Stop the source, refresh the preview, choose a different server name and allocated, unused public IP/port bindings, then review the clone. The original container ports, exact runtime image, template, resources, startup overrides, environment and game files are preserved. Public port reservations use the existing node allocation rules and conflict checks.

The background job creates a verified offline source backup, reserves a new database identity and ports, creates a stopped container, copies the archive with SHA-256 verification and restores it through the native restore transaction. A fresh runtime UUID is assigned; panel accounts, memberships and schedules are not copied. The clone uses restart policy `no` and remains stopped until an operator starts it.

Game configuration includes credentials and any external URLs. Before exposing the clone, review RCON passwords, game service tokens, database connections and FastDownload URLs that may still reference the source. Start the clone and verify its game query and logs. The source stays stopped and is retained for rollback. To abandon the clone, delete that new server through the normal delete flow, then restart the original when appropriate.

Failure leaves a clearly failed, stopped target for inspection or deletion. Partial clones are marked interrupted so ordinary power actions cannot start them. Existing restore-journal recovery still applies if a filesystem transaction was interrupted. Source data is never deleted by cloning.

The WAW2 rehearsal creates a separate runtime identity, database and internal Docker network. Its clone publishes only loopback ports. It exercises the actual backup/clone job and boots the cloned game to verify A2S, then removes its test containers. The real source game's container and configuration are checked unchanged.

## Transfer to another node

Choose a destination in the same form. The target must already contain the exact pinned runtime image and installer image, with compatible architecture and CPU resources. Select IP/ports allocated to that target. Runtime images are deliberately not pulled from arbitrary source metadata.

A root-only, durable control-plane job exports an offline backup and private manifest, reserves a fresh target identity, streams the archive over signed agent requests, checks its exact size and SHA-256, and restores it with the same transaction as a local clone. Production node origins require HTTPS. The control plane buffers only stream chunks, never the whole game archive. Maximum archive is 50 GiB, stream deadline four minutes, export/restore polling deadline 30 minutes. Agent proxies need the scoped receive location installed by `deploy/tools/eserv_transfer_proxy.py` (50 GiB receive limit, request buffering disabled); ordinary API limits stay unchanged.

The latest transfer appears again after refreshing the page. A stable Idempotency-Key prevents re-dispatch; a panel restart records interruption. A lost response after destination admission is marked uncertain and requires checking that target before another attempt. Partial uploads remain root-private for inspection and are removed with the failed target. No automatic retries or target start occur. Source files and identity remain untouched. If somebody starts or edits the source after export, the destination still represents the exported offline snapshot.

This prepares a migration copy; it does not automatically change DNS, public IP ownership, fleet grants, schedules or the existing fleet identity. Review the stopped target, start it, verify A2S/logs, then deliberately switch external integrations. Keep the old source stopped for rollback.

2026-09-26 19:39:58 UTC rehearsal: two separate runtime processes/databases/node identities on one physical WAW2 host, signed HTTP transfer, checksum, duplicate admission, durable receipt, distinct target identity and A2S after target start passed. Real source unchanged. This tests the complete transfer path but is not a physical cross-host failover or HTTPS proxy load test.

