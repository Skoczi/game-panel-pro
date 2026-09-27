# Multi-node deployment and recovery

[Documentation](../README.md) · [Standalone install/upgrade](INSTALL.md)

## Topology

The panel owns accounts, grants, templates and fleet identity. Each runtime node owns Docker containers, game files, allocations and runtime operations. Node management endpoints are separate from game and SFTP endpoints.

```text
Browser -- HTTPS / WebSocket --> Panel
                                  |-- local runtime --> Docker + game data
                                  |-- HTTPS / WSS --> Agent A --> Docker + game data
                                  `-- HTTPS / WSS --> Agent B --> Docker + game data
```

## Add a node

1. Use Nodes → Add node to create a node with its HTTPS management origin.
2. On that machine, use the same reviewed release checkout as the panel:

   ```bash
   sudo python3 deploy/agent/agent.py install \
     --root /srv/gamepanel-agent \
     --panel https://panel.example.com \
     --node NODE_UUID_FROM_PANEL
   ```

3. Paste the one-time enrollment token at the hidden prompt. Installation refuses an existing root. Configure a valid HTTPS reverse proxy to the agent's local endpoint.
4. Forward both `/api` and `/api/…` with WebSocket upgrades. Do not redirect the WebSocket endpoint or cache API responses. Do not log authentication headers.
5. Confirm both directions of connectivity: the heartbeat reaches the panel, and the panel can read the runtime. Configure game-IP allocations before provisioning.
6. Use a disposable server to validate console, file writes, uploads/downloads and recovery before assigning production workloads.

The detailed [agent protocol and proxy reference](../skoczi/NODES.md) covers enrollment, transport and rollback. Treat runtime mounts and the Docker socket as privileged infrastructure.

## Coordinated upgrade

Use a fixed source revision and record current image identities. Back up panel and agent databases, environment files, enrollment credentials and recovery journals privately. Preserve the separate game-data backup.

For a standard agent layout, run from the new checkout:

```bash
sudo python3 deploy/agent/agent.py upgrade --root /srv/gamepanel-agent
```

Update agents before the panel, then use the [panel upgrade procedure](INSTALL.md#upgrade-to-210). Check version/health, fleet identity, permissions, console and file access. Custom Compose layouts require a reviewed deployment procedure; do not overwrite their configuration with the standalone installer.

## Node-side dependencies

- Additional IPs require the host network service described in [networking](HOST-NETWORK-2026-09-27.md). Persisted host setup must work before the panel starts.
- Per-server SFTP requires the compatible host service and firewall/network setup in [SFTP](SFTP-2026-09-27.md).
- Shared packages and runtime images must exist on every intended target. See [shared files](../../runtime/shared/README.md).
- External backup destinations must be mounted and writable under the reviewed storage policy. A configured path alone does not prove off-host durability.

## Recovery

Panel rollback restores panel state, not game files. Use the snapshot's matching database, image IDs and source. Do not run old code against a newer schema without a verified recovery procedure. Agent rollback uses the snapshot recorded by its deployment tool.

Keep unfinished-operation journals until recovery has resolved them. Do not delete a maintenance marker to bypass a failed update. Game restore and shared-package restoration are separate procedures.

## Acceptance before publication

Run unit/UI checks, Docker-backed deployment and node tests, and a disposable game install. Verify that game containers outside the test scope remain untouched. Record any untested game/client/framework combinations in the release validation file.
