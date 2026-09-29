import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MATCHBOT_VERSION, MATCHBOT_SOURCE, matchbotReleaseHashes, matchbotVersionForHash } from '../src/services/matchbotRelease.js';

process.env.DOMAIN = 'matchbot-release-test.invalid';
process.env.PORT = '3001';
process.env.JWT_SECRET = 'fixture-only-matchbot-release-secret';
const { MIXQUEUE_VERSION, sourceHashes } = await import('../src/services/mixqueueNode.js');

const runtime = new URL('../../runtime/mixqueue/', import.meta.url);
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
test('controller release verifies with independent agent pins and immutable published releases', async () => {
  for (const [name, expected] of Object.entries(matchbotReleaseHashes)) {
    assert.equal(hash(await fs.readFile(new URL(name, runtime))), expected, name);
  }
  const old = hash(await fs.readFile(new URL('matchbot_csco_mm.so', runtime)));
  assert.equal(old, '0298b8d2e8096094789123e773b65861de5da296fdcb48cec6e3cc94f1b7c11e');
  assert.equal(matchbotVersionForHash(old), '0.4.0');
  const previous = hash(await fs.readFile(new URL('releases/0.4.1/matchbot_csco_mm.so', runtime)));
  assert.equal(previous, 'f0062c2ce1915a193830dadcb3a4b3efabf052cd6654bdf3a75cb4ae8bf4b6bb');
  assert.equal(matchbotVersionForHash(previous), '0.4.1');
  const v050 = hash(await fs.readFile(new URL('releases/0.5.0/matchbot_csco_mm.so', runtime)));
  assert.equal(v050, '0b66608bb29296e101f5191b8a73c5b3d2359e0dc4441f17397d9852df36b490');
  assert.equal(matchbotVersionForHash(v050), '0.5.0');
  const v051 = hash(await fs.readFile(new URL('releases/0.5.1/matchbot_csco_mm.so', runtime)));
  assert.equal(v051, '6cac5c2f16e8236580ebf8738a95678c60946497571de645a0175293eef6dffb');
  assert.equal(matchbotVersionForHash(v051), '0.5.1');
  const v052 = hash(await fs.readFile(new URL('releases/0.5.2/matchbot_csco_mm.so', runtime)));
  assert.equal(v052, 'ae8cf6516f4a684d44bff8e21f0a590b1de1988351557450bc76efdfe6d1e82d');
  assert.equal(matchbotVersionForHash(v052), '0.5.2');
  const v061 = hash(await fs.readFile(new URL('releases/0.6.1/matchbot_csco_mm.so', runtime)));
  assert.equal(v061, 'c53d87ad9078e4a53d56ebad468e54a362f4f1efde8d6c0badfa1da4d46ec89a');
  assert.equal(matchbotVersionForHash(v061), '0.6.1');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-agent-0.6.0.zip', runtime))), 'b1be179add3b5b71de07c5738ab0566b923c6368e4dc01e270ed91adf34e2ce4');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.5.2.zip', runtime))), '86381d8451b0661d0d572a5857f87ebf1c563ee979307b8aa1fecdf5560f5f34');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-agent-0.5.1.zip', runtime))), '65c0dff7644b5284ef8630512c170be145c48f7182b004f32fc3ce0373a9aa5a');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.5.1.zip', runtime))), 'a7f4894e35f41058f62cdf6d3b80d03624b9b69e616103af3deaba77e1e15c1b');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.5.0.zip', runtime))), '57638e836ba41c0c3f8ddbed467568e147bc4d97283d8ed5991e56bddc99666f');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.4.1.zip', runtime))), '43e68619e5682bbadd8df502f0f29474526bea42a451add5bc29016f1a913121');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-agent-0.5.0.zip', runtime))), '005b045255862f1ca848127580ae70111de9115db6cc62a6737907bb3e8df464');
  assert.equal(matchbotVersionForHash(matchbotReleaseHashes[MATCHBOT_SOURCE]), MATCHBOT_VERSION);
  assert.equal(matchbotVersionForHash(hash(Buffer.from('untrusted controller'))), null);
  assert.equal(hash(await fs.readFile(new URL('mq_agent.py', runtime))), '2f14a107c210ae69d65a85ea3614c66c854b52ee6dcf3ea6ccb7dd72b027970a');
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-cs16-0.4.0.zip', runtime))), '89a04a3c461095d0e82f732d189b18dbf6f78c300f58ced0d504986e622f163b');
});

test('controller and agent upgrade retain the dependency contract', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('releases/0.6.2/manifest.json', runtime), 'utf8'));
  assert.equal(MATCHBOT_VERSION, manifest.controller_version);
  assert.equal(MIXQUEUE_VERSION, manifest.agent_version);
  assert.equal(MIXQUEUE_VERSION, '0.6.1');
  assert.equal(sourceHashes['mq_agent.py'], manifest.sourceHashes['mq_agent.py']);
  assert.equal(matchbotReleaseHashes[MATCHBOT_SOURCE], manifest.sourceHashes['matchbot_csco_mm.so']);
  assert.equal(hash(await fs.readFile(new URL('source-bundles/mixqueue2-agent-0.6.1.zip', runtime))), manifest.files['packages/mixqueue2-agent-0.6.1.zip']);
  const previous = JSON.parse(await fs.readFile(new URL('releases/0.6.1/dependencies.json', runtime), 'utf8'));
  const dependencies = JSON.parse(await fs.readFile(new URL('releases/0.6.2/dependencies.json', runtime), 'utf8'));
  assert.deepEqual(dependencies.tested, previous.tested);
  assert.deepEqual(dependencies.archives.filter((item: any) => item.name !== 'regamedll-zbot-profiles'), previous.archives);
  assert.equal(dependencies.archives.find((item: any) => item.name === 'regamedll-zbot-profiles').sha256, matchbotReleaseHashes['releases/0.6.2/resources/bot_profiles-5.30.0.814.zip']);
});
