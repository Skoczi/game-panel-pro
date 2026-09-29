import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { enableMatchbotAi, planMatchbotAi, readBotProfiles, MATCHBOT_AI_PROVENANCE, type MatchbotAiAssets } from '../src/services/matchbotAi.js';
process.env.DOMAIN = 'matchbot-ai-test.invalid'; process.env.PORT = '3001'; process.env.JWT_SECRET = 'fixture-only-matchbot-ai-secret';
const { commitMatchbotFiles, matchbotDestination } = await import('../src/services/matchbotFiles.js');

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'matchbot-ai-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'data/serverfiles');
  await fs.mkdir(path.join(game, 'cstrike/maps'), { recursive: true });
  const bsp = Buffer.from('known map BSP fixture');
  const nav = Buffer.alloc(24);
  nav.writeUInt32LE(0xfeedface, 0); nav.writeUInt32LE(5, 4); nav.writeUInt32LE(bsp.length, 8);
  const profiles = new Map([['cstrike/BotProfile.db', Buffer.from('// original profile header\n')], ['cstrike/BotChatter.db', Buffer.from('// original chatter header\n')]]);
  const proof = Buffer.from(JSON.stringify({ map: 'de_dust2', bsp_bytes: bsp.length, bsp_sha256: hash(bsp), nav_bytes: nav.length, nav_sha256: hash(nav), 'BotProfile.db': hash(profiles.get('cstrike/BotProfile.db')!), 'BotChatter.db': hash(profiles.get('cstrike/BotChatter.db')!) }));
  const provenance = new Map(MATCHBOT_AI_PROVENANCE.map(name => [name, Buffer.from('Original ' + name)]));
  const assets: MatchbotAiAssets = { profiles, nav, proof, provenance };
  return { root, game, bsp, assets };
}

test('AI setting merge preserves comments, quotes, command chains, CRLF and unrelated settings', () => {
  const original = '// bot_enable 0; bot_enable 0\r\n' +
    'hostname "bot_enable 0; untouched"\r\n' +
    ' bot_enable "0" // local setting; bot_enable 0\r\n' +
    'mp_timelimit 20; bot_enable 0; bot_quota 0\r\n' +
    '"bot_enable" 0\r\n' +
    'alias example "bot_enable 0; echo hi"\r\n';
  const expected = '// bot_enable 0; bot_enable 0\r\n' +
    'hostname "bot_enable 0; untouched"\r\n' +
    ' bot_enable "1" // local setting; bot_enable 0\r\n' +
    'mp_timelimit 20; bot_enable "1"; bot_quota 0\r\n' +
    '"bot_enable" "1"\r\n' +
    'alias example "bot_enable 0; echo hi"\r\n';
  assert.equal(enableMatchbotAi(original), expected);
  assert.equal(enableMatchbotAi(expected), expected);
  assert.equal(enableMatchbotAi('// no bots\r\nmp_autoteambalance 0'), '// no bots\r\nmp_autoteambalance 0\r\nbot_enable "1"\r\n');
  assert.equal(enableMatchbotAi(''), 'bot_enable "1"\n');
});

test('official bot archive is hash verified and retains DB headers and every radio sound', async () => {
  const archive = await fs.readFile(new URL('../../runtime/mixqueue/releases/0.6.2/resources/bot_profiles-5.30.0.814.zip', import.meta.url));
  const files = await readBotProfiles(archive);
  assert.equal(files.size, 489);
  assert.equal(hash(files.get('cstrike/BotProfile.db')!), 'b1ee270d717d7bef6b2cd53e851cf1b558cd2ecdde89a4e45267481183673fba');
  assert.equal(hash(files.get('cstrike/BotChatter.db')!), 'd371bafbb585db3bdf25eed889095d66af9159685437e3087448a050890da302');
  assert.ok([...files.keys()].every(matchbotDestination));
  const modified = Buffer.from(archive); modified[modified.length - 1] ^= 1;
  await assert.rejects(readBotProfiles(modified), /source_verification_failed/);
});

test('NAV requires the exact BSP pair and never overwrites existing navigation or customized profiles', async t => {
  const { game, bsp, assets } = await fixture(t);
  let result = await planMatchbotAi(game, assets);
  assert.equal(result.summary.navigation[0].status, 'missing_bsp');
  assert.equal(result.plan.has('cstrike/maps/de_dust2.nav'), false);
  await fs.writeFile(path.join(game, 'cstrike/maps/de_dust2.bsp'), Buffer.alloc(bsp.length));
  result = await planMatchbotAi(game, assets);
  assert.equal(result.summary.navigation[0].status, 'bsp_mismatch');
  assert.equal(result.plan.has('cstrike/maps/de_dust2.nav'), false);
  await fs.writeFile(path.join(game, 'cstrike/maps/de_dust2.bsp'), bsp);
  result = await planMatchbotAi(game, assets);
  assert.equal(result.summary.navigation[0].status, 'install');
  assert.deepEqual(result.plan.get('cstrike/maps/de_dust2.nav'), assets.nav);
  await fs.writeFile(path.join(game, 'cstrike/maps/de_dust2.nav'), 'hand edited navigation');
  await fs.writeFile(path.join(game, 'cstrike/BotProfile.db'), 'local profile');
  result = await planMatchbotAi(game, assets);
  assert.equal(result.summary.navigation[0].status, 'preserved');
  assert.equal(result.plan.has('cstrike/maps/de_dust2.nav'), false);
  assert.equal(result.plan.has('cstrike/BotProfile.db'), false);
  await fs.writeFile(path.join(game, 'cstrike/maps/de_dust2.nav'), assets.nav);
  result = await planMatchbotAi(game, assets);
  assert.equal(result.summary.navigation[0].status, 'verified');
});

test('review fingerprint fences cfg, NAV, BSP and customized resource edits', async t => {
  const { game, bsp, assets } = await fixture(t);
  await fs.writeFile(path.join(game, 'cstrike/maps/de_dust2.bsp'), bsp);
  let before = await planMatchbotAi(game, assets);
  for (const [name, content] of [['game_init.cfg', 'bot_enable 0\n'], ['BotProfile.db', 'custom profile'], ['maps/de_dust2.nav', 'custom nav'], ['maps/de_dust2.bsp', 'new BSP']]) {
    await fs.writeFile(path.join(game, 'cstrike', name), content);
    const after = await planMatchbotAi(game, assets);
    assert.notEqual(after.fingerprint, before.fingerprint, name);
    before = after;
  }
});

test('local navigation library installs each proven pair independently and rejects duplicate or unsafe maps', async t => {
  const { game, bsp, assets } = await fixture(t);
  const proof = { ...JSON.parse(assets.proof.toString('utf8')), map: 'de_nuke' };
  assets.navigation = [{ nav: assets.nav, proof: Buffer.from(JSON.stringify(proof)) }];
  assets.navigationManifest = Buffer.from(JSON.stringify({ maps: [proof] }));
  await fs.writeFile(path.join(game, 'cstrike/maps/de_nuke.bsp'), bsp);
  const result = await planMatchbotAi(game, assets);
  assert.deepEqual(result.summary.navigation.map(entry => [entry.map, entry.status]), [['de_dust2', 'missing_bsp'], ['de_nuke', 'install']]);
  assert.equal(result.plan.has('cstrike/maps/de_dust2.nav'), false);
  assert.equal(result.plan.has('cstrike/maps/de_nuke.nav'), true);
  assert.deepEqual(result.plan.get('cstrike/addons/matchbot/resources/navigation-manifest.json'), assets.navigationManifest);
  for (const map of ['de_dust2', '../private', 'de_nuke/secret']) {
    assets.navigation = [{ nav: assets.nav, proof: Buffer.from(JSON.stringify({ ...proof, map })) }];
    await assert.rejects(planMatchbotAi(game, assets), /source_verification_failed/);
  }
});

test('AI plan and transaction roll back cfg and new resources without replacing recovery markers', async t => {
  const { root, game, bsp, assets } = await fixture(t);
  await fs.writeFile(path.join(game, 'cstrike/maps/de_dust2.bsp'), bsp);
  const config = '// owned by operator\nbot_enable 0\nmp_timelimit 0\n';
  await fs.writeFile(path.join(game, 'cstrike/game_init.cfg'), config);
  await fs.mkdir(path.join(game, 'cstrike/addons/amxmodx/configs/mq2'), { recursive: true });
  const marker = path.join(game, 'cstrike/addons/amxmodx/configs/mq2/original-bots.txt');
  await fs.writeFile(marker, 'controller recovery');
  const inode = (await fs.stat(marker)).ino;
  const prepared = await planMatchbotAi(game, assets);
  await assert.rejects(commitMatchbotFiles(root, prepared.plan, async name => { if (name === 'cstrike/maps/de_dust2.nav') throw new Error('test disk fault'); }), /test disk fault/);
  assert.equal(await fs.readFile(path.join(game, 'cstrike/game_init.cfg'), 'utf8'), config);
  await assert.rejects(fs.stat(path.join(game, 'cstrike/BotProfile.db')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(game, 'cstrike/maps/de_dust2.nav')), { code: 'ENOENT' });
  assert.equal((await fs.stat(marker)).ino, inode);
  assert.equal(await fs.readFile(marker, 'utf8'), 'controller recovery');
  const recovery = await commitMatchbotFiles(root, prepared.plan);
  assert.equal(await fs.readFile(path.join(root, recovery, 'cstrike/game_init.cfg'), 'utf8'), config);
  assert.equal(await fs.readFile(path.join(game, 'cstrike/game_init.cfg'), 'utf8'), config.replace('bot_enable 0', 'bot_enable "1"'));
  const repeated = await planMatchbotAi(game, assets);
  assert.equal(repeated.plan.size, 0);
  assert.equal(repeated.summary.navigation[0].status, 'verified');
});

test('AI resources reject symlink destinations and proof mismatches', async t => {
  const { game, assets } = await fixture(t);
  const badNav = Buffer.from(assets.nav); badNav[0] ^= 1;
  await assert.rejects(planMatchbotAi(game, { ...assets, nav: badNav }), /source_verification_failed/);
  await fs.writeFile(path.join(game, 'cstrike/server.cfg'), 'private config');
  await fs.symlink('server.cfg', path.join(game, 'cstrike/BotProfile.db'));
  await assert.rejects(planMatchbotAi(game, assets), /regular file/);
  for (const name of ['cstrike/maps/../other.nav', 'cstrike/maps/de_dust2.bsp', 'cstrike/sound/radio/bot/../secret.wav', 'cstrike/addons/matchbot/resources/secret.json', 'cstrike/addons/amxmodx/configs/mq2/original-bots.txt']) assert.equal(matchbotDestination(name), false);
});
