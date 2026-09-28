# MixQueue executor sources

Imported from the operator-provided `csco-matchmaking` workspace. The source workspace has no Git metadata; content digests are the source identity. No latest-branch download or import-supplied download URL is used.

| File | SHA-256 |
| --- | --- |
| mq_agent.py | ca88f35c1c7ae905ec3b4e7e9f9e6b83653c3ceee57b901fb77782cc6ddb9b72 |
| mq2_match.amxx | 9d35397d96fa6e643cf4ea83a52d6d3a84207099d309c0fd136252e014a1731d |
| mq2_bridge.smx | b86938870e03f318a0eb708864edf327c9a5c7b53a67ef2bb6a3302d728dbf45 |

`mq_agent.py` is unmodified. `runner.py` supplies the ESERV sandbox transport and safe status reporting. The Python image is pinned by digest in `Dockerfile`. Plugin binaries are not part of the executor image.

The source package identifies AMX Mod X 1.10.0.5486, SourceMod 1.11.0.6970, Get5 API commit `d937484beb1ddb8870126e6127d92c8df7845956` and sm-json commit `fd63b4458cea4ba61d1bb84b5491f1b988b61fdb`. Source servers need a compatible Get5 installation as well as the bridge. A functioning Source RCON connection alone does not establish that dependency or match compatibility.

The unmodified `source-bundles/mixqueue2-cs16-0.2.3.zip` and `source-bundles/mixqueue2-source-0.2.3.zip` preserve the original plugin sources, compiler includes, dependency licenses and checksums. They accompany the verified binaries installed by the panel. The executor image contains only Python sources; it does not include game-plugin binaries.
