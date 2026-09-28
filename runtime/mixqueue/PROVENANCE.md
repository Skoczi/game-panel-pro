# MixQueue executor sources

Imported from the operator-provided `csco-matchmaking` workspace. The source workspace has no Git metadata; content digests are the source identity. No latest-branch download or import-supplied download URL is used.

| File | SHA-256 |
| --- | --- |
| mq_agent.py | 90ee2cc8ad515c6972ec89ef339af9ec93b7fc66ac6eae8f4e98327cc790b58b |
| mq2_match.amxx | 28ba83817d8aeb9ccd2cc9bb9929dcf7a1974d98e68d1a7dafef089f86c90ca4 |
| mq2_bridge.smx | b86938870e03f318a0eb708864edf327c9a5c7b53a67ef2bb6a3302d728dbf45 |

`mq_agent.py` is unmodified. `runner.py` supplies the ESERV sandbox transport and safe status reporting. The Python image is pinned by digest in `Dockerfile`. Plugin binaries are not part of the executor image.

The source package identifies AMX Mod X 1.10.0.5486, SourceMod 1.11.0.6970, Get5 API commit `d937484beb1ddb8870126e6127d92c8df7845956` and sm-json commit `fd63b4458cea4ba61d1bb84b5491f1b988b61fdb`. Source servers need a compatible Get5 installation as well as the bridge. A functioning Source RCON connection alone does not establish that dependency or match compatibility.

The unmodified `source-bundles/mixqueue2-cs16-0.2.3.zip` and `source-bundles/mixqueue2-source-0.2.3.zip` preserve the original plugin sources, compiler includes, dependency licenses and checksums. They accompany the verified binaries installed by the panel. The executor image contains only Python sources; it does not include game-plugin binaries.

## MixQueue2 0.3.0

Imported from the operator-provided `mixqueue2-eserv-0.3.0.zip` after verifying every entry in `SHA256SUMS.txt` and `manifest.json`. Agent protocol 2 and the CS 1.6 solo-test controller are bundled together. The Source bridge remains unchanged at 0.2.3. The original 0.3.0 CS 1.6 source/license archive is retained in `source-bundles/`. ESERV `runner.py`, its schedule, the broker transport and sandbox are unchanged.
