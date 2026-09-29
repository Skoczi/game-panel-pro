import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MATCHBOT_VERSION, MATCHBOT_SOURCE, matchbotReleaseHashes, matchbotVersionForHash } from '../src/services/matchbotRelease.js';

const runtime = new URL('../../runtime/mixqueue/', import.meta.url);
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
test('versioned controller artifacts verify and updated agent verify without changing published 0.4.0/0.4.1', async () => {
  for (const [name, expected] of Object.entries(matchbotReleaseHashes)) {
    assert.equal(hash(await fs.readFile(new URL(name, runtime))), expected, name);
  }
  const old = hash(await fs.readFile(new URL('matchbot_csco_mm.so', runtime)));
  assert.equal(old, '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e');
  assert.equal(matchbotVersionForHash(old), '0.4.0');
  const previous = hash(await fs.readFile(new URL('releases/0.4.1/matchbot_csco_mm.so', runtime)));
  assert.equal(previous, 'f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb');
  assert.equal(matchbotVersionForHash(previous), '0.4.1');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.4.1.zip', runtime))), '43e68619e5682bbadd8df502f0f29474526bea42a451add5bc29016f1a913121');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-agent-0.5.0.zip', runtime))), '005b045255862f1ca848127580ae70111de9115db6cc62a6737907bb3e8df464');
  assert.equal(matchbotVersionForHash(matchbotReleaseHashes[MATCHBOT_SOURCE]), MATCHBOT_VERSION);
  assert.equal(matchbotVersionForHash(hash(Buffer.from('untrusted controller'))), null);
  assert.equal(hash(await fs.readFile(new URL('mq_agent.py', runtime))), '841dfd69daf64950a526244af6d1adc30d98a5fc81b0cb3805fdf3ede465db84');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.4.0.zip', runtime))), '89a04a3c461095d0e82f732d189b18dbf6f78c300f58ced0d504986e622f163b');
});
