# Native server cloning

Root administrators can open a server from Game Servers, then use **Game Config → Clone server**. This first stage supports the same node and Native templates with one `data` mount at `/data`. A pending settings change must be applied or discarded before cloning.

Stop the source, refresh the preview, choose a different server name and allocated, unused public IP/port bindings, then review the clone. The original container ports, exact runtime image, template, resources, startup overrides, environment and game files are preserved. Public port reservations use the existing node allocation rules and conflict checks.

The background job creates a verified offline source backup, reserves a new database identity and ports, creates a stopped container, copies the archive with SHA-256 verification and restores it through the native restore transaction. A fresh runtime UUID is assigned; panel accounts, memberships and schedules are not copied. The clone uses restart policy `no` and remains stopped until an operator starts it.

Game configuration includes credentials and any external URLs. Before exposing the clone, review RCON passwords, game service tokens, database connections and FastDownload URLs that may still reference the source. Start the clone and verify its game query and logs. The source stays stopped and is retained for rollback. To abandon the clone, delete that new server through the normal delete flow, then restart the original when appropriate.

Failure leaves a clearly failed, stopped target for inspection or deletion. Partial clones are marked interrupted so ordinary power actions cannot start them. Existing restore-journal recovery still applies if a filesystem transaction was interrupted. Source data is never deleted by cloning.

The WAW2 rehearsal creates a separate runtime identity, database and internal Docker network. Its clone publishes only loopback ports. It exercises the actual backup/clone job and boots the cloned game to verify A2S, then removes its test containers. The real source game's container and configuration are checked unchanged.

Cross-node migration is a separate stage; this same-node endpoint does not move a fleet identity or transfer runtime images between hosts.
