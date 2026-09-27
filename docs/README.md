# Game Panel PRO documentation

[Project overview](../README.md) · [Polski](README.pl.md) · [Release 2.1.0](pro/RELEASE-2.1.0.md)

## Start here

| Task | Guide |
| --- | --- |
| Install or upgrade the panel | [Installation, upgrade and rollback](pro/INSTALL.md) |
| Add runtime nodes | [Deployment](pro/DEPLOYMENT.md) |
| Operate a game server | [User guide](USER-GUIDE.md) |
| Integrate a service | [API v1](pro/API-V1-GUIDE.en.md), [OpenAPI](pro/openapi-v1.json), [PDF EN](api/game-panel-pro-api-v1-en.pdf), [PDF PL](api/game-panel-pro-api-v1-pl.pdf) |
| Build or contribute | [Development](pro/DEVELOPMENT.md), [contribution rules](../CONTRIBUTING.md) |

## Feature reference

- Runtime compatibility: [feature matrix](pro/FEATURES.md), [global server IDs](unified-server-ids.md).
- Recovery: [backup protection](pro/BACKUP-PROTECTION.md), [clone and transfer](pro/SERVER-CLONING.md), [maintenance workflows](pro/MAINTENANCE-WORKFLOWS.md).
- Game configuration: [Native configuration](pro/NATIVE-GAME-CONFIG.md), [ReHLDS addons](pro/REHLDS-ADDONS.md), [Source / CS2 / HLTV](../runtime/source/README.md).
- Shared content: [shared packages](../runtime/shared/README.md), [Classic Offensive](../runtime/classic/README.md).
- Infrastructure: [host networking](pro/HOST-NETWORK-2026-09-27.md), [SFTP](pro/SFTP-2026-09-27.md), [FastDownload](skoczi/FASTDOWNLOAD.md).
- Monitoring: [game response](pro/GAME-MONITORING.md), [alerts](pro/MONITORING-ALERTS.md), [API power and webhooks](pro/API-POWER-WEBHOOKS.md).
- Privacy: [telemetry](TELEMETRY.md). Attribution: [NOTICE](../NOTICE).

## Documentation policy

Current guides describe supported behavior. Runtime-specific restrictions belong alongside the feature. Historical release notes are retained under [history](history/README.md); retired audits and deployment diaries remain available in Git history. They are not installation instructions.
