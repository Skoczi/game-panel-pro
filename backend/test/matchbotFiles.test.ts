import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
process.env.DOMAIN = 'matchbot-test.invalid'; process.env.PORT = '3001'; process.env.JWT_SECRET = 'fixture-only-matchbot-test-secret';
const { commitMatchbotFiles, disableConflictingPlugins, registerMatchbot, hasMatchbotTransaction, recoverMatchbotFiles, MATCHBOT_ENTRY, pluginLists } = await import('../src/services/matchbotFiles.js');

test('migration comments only recognized active controllers, retaining unrelated AMXX and comments', () => {
  const original = '; user comment\r\nadmincmd.amxx\r\nteam_sounds.amxx debug\r\nmq2_match.amxx debug\r\ncsdm_spawn_preset.amxx\r\nmapchooser.amxx\r\n; respawn.amxx\r\n';
  const next = disableConflictingPlugins(original);
  assert.deepEqual(next.disabled, ['mq2_match.amxx', 'csdm_spawn_preset.amxx', 'mapchooser.amxx']);
  for (const untouched of ['; user comment\r\n', 'admincmd.amxx\r\n', 'team_sounds.amxx debug\r\n', '; respawn.amxx\r\n']) assert.ok(next.content.includes(untouched));
  assert.deepEqual(disableConflictingPlugins(next.content), { content: next.content, disabled: [] });
});
test('Metamod registration retains AMXX/Reunion and activates only one MatchBot', () => {
  const original = 'linux addons/amxmodx/dlls/amxmodx_mm_i386.so\nlinux addons/metamod/reunion/reunion_mm_i386.so\n' + MATCHBOT_ENTRY + '\n' + MATCHBOT_ENTRY + '\n';
  const next = registerMatchbot(original);
  assert.ok(next.content.startsWith(original.split(MATCHBOT_ENTRY)[0]));
  assert.equal(next.content.split('\n').filter(n => n === MATCHBOT_ENTRY).length, 1);
  assert.equal(registerMatchbot(next.content).content, next.content);
});
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'matchbot-files-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'data/serverfiles');
  await fs.mkdir(path.join(game, 'cstrike/addons/amxmodx/configs/mq2'), { recursive: true });
  await fs.mkdir(path.join(game, 'cstrike/addons/amxmodx/data/mq2'), { recursive: true });
  await fs.writeFile(path.join(game, 'engine_i486.so'), 'old engine');
  for (const name of ['cstrike/server.cfg', 'cstrike/addons/amxmodx/configs/mq2/generation-matchbot.txt', 'cstrike/addons/amxmodx/data/mq2/events.jsonl']) await fs.writeFile(path.join(game, name), 'private fixture');
  return { root, game };
}
test('allowlisted commit preserves journal inode, generations and private game config', async t => {
  const { root, game } = await fixture(t);
  const journal = path.join(game, 'cstrike/addons/amxmodx/data/mq2/events.jsonl');
  const inode = (await fs.stat(journal)).ino;
  const recovery = await commitMatchbotFiles(root, new Map([['engine_i486.so', Buffer.from('new engine')]]));
  assert.equal(await fs.readFile(path.join(game, 'engine_i486.so'), 'utf8'), 'new engine');
  assert.equal((await fs.stat(journal)).ino, inode);
  assert.equal(await fs.readFile(path.join(game, 'cstrike/server.cfg'), 'utf8'), 'private fixture');
  assert.equal(await fs.readFile(path.join(game, 'cstrike/addons/amxmodx/configs/mq2/generation-matchbot.txt'), 'utf8'), 'private fixture');
  assert.equal(await fs.readFile(path.join(root, recovery, 'engine_i486.so'), 'utf8'), 'old engine');
  assert.equal(await hasMatchbotTransaction(root), false);
});
test('partial commit rolls back only binaries and removes newly created files', async t => {
  const { root, game } = await fixture(t);
  const journal = path.join(game, 'cstrike/addons/amxmodx/data/mq2/events.jsonl');
  const inode = (await fs.stat(journal)).ino;
  const plan = new Map([['hlds_linux', Buffer.from('new executable')], ['engine_i486.so', Buffer.from('new engine')]]);
  await assert.rejects(commitMatchbotFiles(root, plan, async name => { if (name === 'engine_i486.so') throw new Error('simulated disk fault'); }), /simulated disk fault/);
  assert.equal(await fs.readFile(path.join(game, 'engine_i486.so'), 'utf8'), 'old engine');
  await assert.rejects(fs.stat(path.join(game, 'hlds_linux')), { code: 'ENOENT' });
  assert.equal((await fs.stat(journal)).ino, inode);
  assert.equal(await hasMatchbotTransaction(root), false);
});
test('transaction rejects private paths and symlinked destinations before replacing anything', async t => {
  const { root, game } = await fixture(t);
  await assert.rejects(commitMatchbotFiles(root, new Map([['cstrike/server.cfg', Buffer.from('bad')]])), /invalid_matchbot_destination/);
  await fs.symlink('cstrike/server.cfg', path.join(game, 'hlds_linux'));
  await assert.rejects(commitMatchbotFiles(root, new Map([['hlds_linux', Buffer.from('bad')]])), /regular file/);
  assert.equal(await fs.readFile(path.join(game, 'cstrike/server.cfg'), 'utf8'), 'private fixture');
});
test('a killed installer is recovered on next boot without rewinding journal events', async t => {
  const { root, game } = await fixture(t);
  const journal = path.join(game, 'cstrike/addons/amxmodx/data/mq2/events.jsonl');
  const inode = (await fs.stat(journal)).ino;
  const script = `import { commitMatchbotFiles } from ${JSON.stringify(new URL('../src/services/matchbotFiles.ts', import.meta.url).href)};
    await commitMatchbotFiles(${JSON.stringify(root)}, new Map([['engine_i486.so', Buffer.from('partial')]]), async () => process.exit(19));`;
  await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script]), (e: any) => e.code === 19);
  assert.equal(await hasMatchbotTransaction(root), true);
  assert.equal(await fs.readFile(path.join(game, 'engine_i486.so'), 'utf8'), 'partial');
  await fs.appendFile(journal, '\nnew event');
  await recoverMatchbotFiles(root);
  assert.equal(await fs.readFile(path.join(game, 'engine_i486.so'), 'utf8'), 'old engine');
  assert.equal((await fs.stat(journal)).ino, inode);
  assert.ok((await fs.readFile(journal, 'utf8')).endsWith('new event'));
  assert.equal(await hasMatchbotTransaction(root), false);
});
test('installer inspects per-map AMXX lists and fails closed on a symlinked list', async t => {
  const { game } = await fixture(t);
  const configs = path.join(game, 'cstrike/addons/amxmodx/configs');
  await fs.mkdir(path.join(configs, 'maps'));
  await fs.writeFile(path.join(configs, 'maps/plugins-de_dust2.ini'), 'respawn.amxx\n');
  assert.ok((await pluginLists(game)).has('cstrike/addons/amxmodx/configs/maps/plugins-de_dust2.ini'));
  await fs.symlink('maps/plugins-de_dust2.ini', path.join(configs, 'plugins.ini'));
  await assert.rejects(pluginLists(game), /regular file/);
});
