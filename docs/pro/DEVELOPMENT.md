# Development

Game Panel PRO uses TypeScript/Express, SQLite, Docker and agent transport on the backend; React/Vite and Playwright on the frontend. CI uses Node.js 22. Keep Linux and macOS development compatibility; deployment tools target supported Linux hosts.

```bash
cd backend
npm ci
npm test
npm run build
cd ../frontend
npm ci
npx playwright install chromium
npm run build
npm run test:ui
```

Run deployment checks from the repository root:

```bash
python3 -B deploy/agent/test_agent.py
python3 -B -m unittest discover -s deploy/test -v
find deploy -name '*.sh' -exec bash -n {} \;
```

Docker-backed tests are separate and must use an isolated local Docker engine. See [.github/workflows/skoczi-ci.yml](../../.github/workflows/skoczi-ci.yml) for the actual Compose/agent integration commands. Unit/UI fixtures do not establish a real game-client connection.

Use the shared AppButton, AppInput, AppToggle, AppModal and dropdown controls. Preserve existing runtime records and installed template snapshots. Add regression tests for permission boundaries, recovery and asynchronous writes.

## Documentation and screenshots

Current documentation starts at [docs/README.md](../README.md). Add factual behavior and restrictions beside each feature. Do not publish host inventories, deployment diaries or credentials. Historical release notes are under docs/history.

Set `PLAYWRIGHT_SCREENSHOTS=1` to capture supported UI fixtures. Label fixture captures as demonstration data; never present a mockup as a production validation result. Screenshots are reviewed before copying into docs/screenshots.

## Release packaging

Commit a fixed candidate after validation, then run:

```bash
python3 scripts/prepare-local-release.py --candidate HEAD \
  --rollback v2.0.59 --version 2.1.0 \
  --output ../game-panel-pro-2.1.0-release
```

The package includes committed sources only. It rejects private data paths, records commit IDs and writes SHA256SUMS. It does not deploy, tag or publish. A source rollback archive is not a snapshot of a live database or game files.
