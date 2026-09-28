import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MATCHBOT_VERSION, MATCHBOT_SOURCE, matchbotReleaseHashes, matchbotVersionForHash } from '../src/services/matchbotRelease.js';

const runtime = new URL('../../runtime/mixqueue/', import.meta.url);
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
test('versioned controller artifacts verify without changing the agent or published 0.4.0', async () => {
  for (const [name, expected] of Object.entries(matchbotReleaseHashes)) {
    assert.equal(hash(await fs.readFile(new URL(name, runtime))), expected, name);
  }
  const old = hash(await fs.readFile(new URL('matchbot_csco_mm.so', runtime)));
  assert.equal(old, '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e');
  assert.equal(matchbotVersionForHash(old), '0.4.0');
  assert.equal(matchbotVersionForHash(matchbotReleaseHashes[MATCHBOT_SOURCE]), MATCHBOT_VERSION);
  assert.equal(matchbotVersionForHash(hash(Buffer.from('untrusted controller'))), null);
  assert.equal(hash(await fs.readFile(new URL('mq_agent.py', runtime))), 'f28b4b6c4fb754bd08fdf4517095b97f0ff3b0a3589ce2c6a9b929e118d558d3');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.4.0.zip', runtime))), '89a04a3c461095d0e82f732d189b18dbf6f78c300f58ced0d504986e622f163b');
});
