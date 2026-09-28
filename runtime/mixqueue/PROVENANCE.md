# MixQueue executor sources

Imported from the operator-provided `csco-matchmaking` workspace. The source workspace has no Git metadata; content digests are the source identity. No latest-branch download or import-supplied download URL is used.

| File | SHA-256 |
| --- | --- |
| mq_agent.py | f28b4b6c4fb754bd08fdf4517095b97f0ff3b0a3589ce2c6a9b929e118d558d3 |
| mq2_match.amxx | 28ba83817d8aeb9ccd2cc9bb9929dcf7a1974d98e68d1a7dafef089f86c90ca4 |
| mq2_bridge.smx | b86938870e03f318a0eb708864edf327c9a5c7b53a67ef2bb6a3302d728dbf45 |

`mq_agent.py` is unmodified. `runner.py` supplies the ESERV sandbox transport and safe status reporting. The Python image is pinned by digest in `Dockerfile`. Plugin binaries are not part of the executor image.

The source package identifies AMX Mod X 1.10.0.5486, SourceMod 1.11.0.6970, Get5 API commit `d937484beb1ddb8870126e6127d92c8df7845956` and sm-json commit `fd63b4458cea4ba61d1bb84b5491f1b988b61fdb`. Source servers need a compatible Get5 installation as well as the bridge. A functioning Source RCON connection alone does not establish that dependency or match compatibility.

The unmodified `source-bundles/mixqueue2-cs16-0.2.3.zip` and `source-bundles/mixqueue2-source-0.2.3.zip` preserve the original plugin sources, compiler includes, dependency licenses and checksums. They accompany the verified binaries installed by the panel. The executor image contains only Python sources; it does not include game-plugin binaries.

## MixQueue2 0.3.0

Imported from the operator-provided `mixqueue2-eserv-0.3.0.zip` after verifying every entry in `SHA256SUMS.txt` and `manifest.json`. Agent protocol 2 and the CS 1.6 solo-test controller are bundled together. The Source bridge remains unchanged at 0.2.3. The original 0.3.0 CS 1.6 source/license archive is retained in `source-bundles/`. ESERV `runner.py`, its schedule, the broker transport and sandbox are unchanged.

## MatchBot CSCO 0.4.0

Imported from the operator-provided `mixqueue2-eserv-0.4.0.zip` (SHA-256 `3391084d268696a65a89c69e461c71eefdba7c42b4151fe7618b28fcc5717629`). All outer manifest/checksum entries and inner checksums were verified. The agent README is covered by its outer archive checksum. Full GPL-3.0 controller sources and licenses are retained in `source-bundles/mixqueue2-cs16-0.4.0.zip`. This is the release Linux i386 binary, not the QA build.

The CS 1.6 installer now uses `matchbot_csco_mm.so` and `matchbot-language.txt`. Legacy AMXX sources are retained for attribution/history, not installed. `adapter=amxx` names the unchanged transport paths. The Source bridge, ESERV runner, broker allowlist, poll schedule and sandbox are unchanged. Dependency URLs and SHA-256 values are recorded in `release-040-dependencies.json` and match the native addon registry.

| 0.4.0 controller asset | SHA-256 |
| --- | --- |
| matchbot_csco_mm.so | 0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e |
| matchbot-language.txt | 877007aa9b884af157b69cd8d33c73af00e4d6583f48a588ec5a26b2ce38bf27 |
## MatchBot CSCO 0.4.1

Operator-provided `mixqueue2-eserv-0.4.1.zip`: SHA-256 `1dfce3e5c1b8c957cbc25319b0333fb6cd10d5c3ca289f6f234ad5810c28cbbf`. All 11 outer checksum entries, manifest entries and 312 CS 1.6 inner entries were verified. Production controller and language assets live in `releases/0.4.1/`; full corresponding GPL sources remain in `source-bundles/mixqueue2-cs16-0.4.1.zip` (SHA-256 `43e68619e5682bbadd8df502f0f29474526bea42a451add5bc29016f1a913121`). This bundled archive is the installer source; it is not downloaded from an unversioned URL.

The controller requires CSCO WWW >=0.5.2. Its Python agent remains byte-identical 0.4.0 / protocol 2, and the ESERV runner/broker are unchanged. Published 0.4.0 assets, source archive and hashes are retained without modification. Controller 0.4.1 fixes the observed server-side reconnect behavior; it does not establish the cause of the original client crash. See the bundled release and acceptance documents for upstream automated coverage and remaining real-player gates.
