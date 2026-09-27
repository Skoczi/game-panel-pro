# 2.1.0 validation

Status: locally validated release candidate. No production deployment or public release is implied by this report.

## Completed checks

Validated on 2026-09-27 in Debian WSL with a local Docker engine.

| Check | Result |
| --- | --- |
| Backend unit tests and TypeScript build | 295 passed; build passed |
| Full Chromium UI suite, two workers | 298 passed |
| Settings regression after final legal-modal theme adjustment | 13 passed |
| Deployment unit tests | 11 passed, including 2.0.59 → 2.1.0 rollback, version boundaries and maintenance draining |
| Agent deployment tests | 3 passed |
| General Docker integration suite | 2 passed, 4 skipped by environment; the node suite was run separately below |
| Central panel plus independent agent on real Docker | Passed: installation, files, WebSocket, authorization and backup recovery fault cases |
| Real Compose migration and rollback | 2.0.59 → 2.1.0 → rollback passed; data and proxy retained |
| Backend/agent, frontend and updater Docker images | All built from source |
| Built frontend HTTP smoke check | Deep-link fallback, HTML cache policy and security headers passed |
| Deployment shell syntax and Git whitespace check | Passed |
| Local documentation links and images | Checked by `scripts/check-doc-links.py`; also runs in CI |

The frontend Docker build exposed a missing shared `sourceProfile.ts` input. The Dockerfile now includes it; the rebuilt image passed the HTTP check. The frontend build still reports large JavaScript chunks; build success is not a page-performance measurement.

UI screenshots use real components with deterministic demonstration data. They contain no production credentials or customer inventory.

## Acceptance still required before stable publication

- Install a disposable real game through API v1, connect with a game client, then verify console, files, backup and restore. Existing public-API tests and the real node installer test cover different parts of this flow; they do not establish that full end-to-end result.
- Validate the new-host installer on a clean supported Linux host with a real domain/TLS. Source builds, installer unit tests and Compose migration fixtures have passed; they do not replace that host acceptance.
- Push the candidate and obtain a green GitHub Actions run. Local test results are not hosted CI results.

Original upstream copyright and third-party notices are retained. Existing operator branding and deployment-specific terms are not silently replaced by the new defaults.
