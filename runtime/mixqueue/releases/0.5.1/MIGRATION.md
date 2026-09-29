# WWW 0.6.4 → 0.6.5

No SQL schema migration. Retains the 0.6.4 lobby, ready dialog/sound and collapsed
test controls. Deploy the updated module and CLI runtime together, publish the
matching locale/JS assets, clear Flute cache/templates and restart mq2-worker.
Back up the previous release/module before deployment; preserve all DB records.

New MapInventory and LoadFailure domain classes enforce verified CS 1.6 pools
and render safe load diagnostics. Poll advertises load_rejection_contract=1.
Load failure uses the existing cancellation/abort/idle release workflow, without
resetting generations, deleting history, changing ELO or adding test penalties.

Roll out WWW first, then ESERV controller/agent 0.5.1 with the required custom
runner dispatch change. Until its authenticated map_inventory arrives, new CS 1.6
tests/allocation are blocked. Existing accepted matches and cleanup remain
supported. Keep public pool eligibility disabled during acceptance.

The versioned controller/agent archives are separate downloads. Install both
new archives plus the download manifest on WWW before exposing their links;
retain all old versioned downloads byte-for-byte. Do not put private configuration
or credentials into the release or its public assets.

Rollback must account for pending load_rejected events: acknowledge/drain them
before downgrading WWW. Restore the previous module/assets/runtime and clear
Flute caches/restart worker. Never roll back the database or agent spool over
new history. Old agent 0.5.0 cannot satisfy the inventory gate in WWW 0.6.5.
