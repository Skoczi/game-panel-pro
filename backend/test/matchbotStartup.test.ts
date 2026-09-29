import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planMatchbotStartup } from '../src/services/matchbotStartup.js';
import { enableMatchbotAi } from '../src/services/matchbotAi.js';
process.env.DOMAIN = 'matchbot-startup-test.invalid'; process.env.PORT = '3001'; process.env.JWT_SECRET = 'fixture-only-matchbot-startup-secret';
const { commitMatchbotFiles } = await import('../src/services/matchbotFiles.js');
const startup = { argv: ['./hlds_linux', '-game', 'cstrike', '+servercfgfile', 'server.cfg', '+map', 'de_dust2'] };

async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'matchbot-startup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const game = path.join(root, 'data/serverfiles');
  await fs.mkdir(path.join(game, 'cstrike/cfg'), { recursive: true });
  return { root, game };
}

test('one full-start log entry merges with AI setting, retaining cfg and private server settings', async t => {
  const { root, game } = await fixture(t);
  const original = '// Host settings\r\nbot_enable "0"\r\nhostage_ai_enable "0"';
  const privateConfig = 'rcon_password "private-fixture"\nhostname "Operator server"\n';
  await fs.writeFile(path.join(game, 'cstrike/game_init.cfg'), original);
  await fs.writeFile(path.join(game, 'cstrike/server.cfg'), privateConfig);
  const aiMerge = Buffer.from(enableMatchbotAi(original));
  const review = await planMatchbotStartup(game, startup, aiMerge);
  assert.equal(review.startupLogging, 'add');
  assert.deepEqual([...review.plan.keys()], ['cstrike/game_init.cfg']);
  assert.equal(review.plan.get('cstrike/game_init.cfg')!.toString(), original.replace('bot_enable "0"', 'bot_enable "1"') + '\r\nlog on\r\n');
  const recovery = await commitMatchbotFiles(root, review.plan);
  assert.equal(await fs.readFile(path.join(root, recovery, 'cstrike/game_init.cfg'), 'utf8'), original);
  assert.equal(await fs.readFile(path.join(game, 'cstrike/server.cfg'), 'utf8'), privateConfig);
  const repeated = await planMatchbotStartup(game, startup);
  assert.equal(repeated.startupLogging, 'configured');
  assert.equal(repeated.plan.size, 0);
});

test('existing direct or shell-template +log on and configured includes are preserved', async t => {
  const { game } = await fixture(t);
  for (const argv of [
    [...startup.argv, '+log', 'on'],
    ['/bin/bash', '-c', 'set -e\ncd /data/serverfiles\nexec ./hlds_linux -game cstrike +log "on" +servercfgfile "$CFG" +map de_dust2'],
    ['/bin/sh', '-c', "cd /data/serverfiles && exec ./hlds_linux +log 'on'; echo done"],
    ['/bin/bash', '-c', 'exec "$@"', '--', ...startup.argv, '+log', 'on'],
  ]) {
    const result = await planMatchbotStartup(game, { argv, cfg: 'server.cfg' });
    assert.equal(result.startupLogging, 'configured');
    assert.equal(result.plan.size, 0);
  }
  await fs.writeFile(path.join(game, 'cstrike/server.cfg'), 'exec "cfg/logging.cfg"\n');
  await fs.writeFile(path.join(game, 'cstrike/cfg/logging.cfg'), 'log "on" // existing operator entry\nexec server.cfg\n');
  const result = await planMatchbotStartup(game, startup);
  assert.equal(result.startupLogging, 'configured');
  assert.equal(result.plan.size, 0);
});

test('comments, quoted text and echo examples are not mistaken for logging commands', async t => {
  const { game } = await fixture(t);
  await fs.writeFile(path.join(game, 'cstrike/server.cfg'), '// log on; log off\nhostname "log on"\nalias example "log on"\n');
  const result = await planMatchbotStartup(game, { argv: ['/bin/bash', '-c', '# exec ./hlds_linux +log on\necho "./hlds_linux +log on"\nexec ./hlds_linux -game cstrike # +log on'] });
  assert.equal(result.startupLogging, 'add');
  assert.equal(result.plan.get('cstrike/game_init.cfg')!.toString(), 'log on\n');
});

test('combined shell flags and assignment/env wrappers retain existing startup logging', async t => {
  const { game } = await fixture(t);
  for (const flags of [['-lc'], ['-ec'], ['-euc'], ['-e', '-u', '-c'], ['--noprofile', '-o', 'pipefail', '-lc']]) {
    for (const launch of [
      'LD_LIBRARY_PATH=. ./hlds_linux +log on',
      'exec env LD_LIBRARY_PATH=. ./hlds_linux +log on',
      'CFG=server.cfg exec /usr/bin/env -i PATH=/usr/bin ./hlds_linux +servercfgfile "$CFG" +log "on"',
      'exec -a cs16 env --unset LD_PRELOAD -- LD_LIBRARY_PATH=. ./hlds_linux +log on',
    ]) {
      const result = await planMatchbotStartup(game, { argv: ['/bin/bash', ...flags, launch] });
      assert.equal(result.startupLogging, 'configured', flags.join(' ') + ' ' + launch);
      assert.equal(result.plan.size, 0);
    }
  }
  for (const argv of [
    ['/usr/bin/env', 'LD_LIBRARY_PATH=.', './hlds_linux', '+log', 'on'],
    ['/sbin/tini', '--', '/bin/sh', '-ec', 'exec "$@"', 'entrypoint', './hlds_linux', '+log', 'on'],
    ['/sbin/tini', '--', './hlds_linux', '+log', 'on'],
  ]) assert.equal((await planMatchbotStartup(game, { argv })).startupLogging, 'configured');
});

test('opaque shell launches fail closed instead of appending a potentially duplicate log command', async t => {
  const { game } = await fixture(t);
  for (const argv of [
    ['/bin/bash', '-lc', 'eval ./hlds_linux +log on'],
    ['/bin/bash', '-lc', 'exec "$GAME_STARTUP"'],
    ['/bin/bash', '-lc', 'if true; then ./hlds_linux +log on; fi'],
    ['/bin/bash', '-lc', 'nice -n 5 ./hlds_linux +log on'],
    ['/bin/bash', '-lc', "exec env -S './hlds_linux +log on'"],
    ['/bin/bash', '-lc', 'CFG=custom.cfg; exec ./hlds_linux +servercfgfile "$CFG"'],
    ['/bin/bash', '-lc', 'export CFG=custom.cfg; exec ./hlds_linux +servercfgfile "$CFG"'],
    ['/bin/bash', '-lc', 'exec ./hlds_linux +log "$LOGGING"'],
    ['./hlds_linux', '+log', '$LOGGING'],
    ['/bin/bash', '/private/start-game.sh'],
    ['/private/start-game.sh'],
  ]) await assert.rejects(planMatchbotStartup(game, { argv }), /invalid_matchbot_startup/);
  await assert.rejects(fs.stat(path.join(game, 'cstrike/game_init.cfg')), { code: 'ENOENT' });
});

test('shell CFG expansion uses the parent environment before inline/env assignments', async t => {
  const { game } = await fixture(t);
  await fs.writeFile(path.join(game, 'cstrike/server.cfg'), 'log on\n');
  await fs.writeFile(path.join(game, 'cstrike/custom.cfg'), 'log off\n');
  for (const launch of [
    'CFG=custom.cfg ./hlds_linux +servercfgfile "$CFG"',
    'exec env CFG=custom.cfg ./hlds_linux +servercfgfile "$CFG"',
  ]) {
    const result = await planMatchbotStartup(game, { argv: ['/bin/bash', '-lc', launch], cfg: 'server.cfg' });
    assert.equal(result.startupLogging, 'configured');
    assert.equal(result.plan.size, 0);
  }
});

test('review includes active cfg, recursive includes and actual startup options', async t => {
  const { game } = await fixture(t);
  await fs.writeFile(path.join(game, 'cstrike/custom.cfg'), 'exec cfg/host.cfg\n');
  await fs.writeFile(path.join(game, 'cstrike/cfg/host.cfg'), 'mp_timelimit 0\n');
  const custom = { argv: ['./hlds_linux', '+servercfgfile', 'custom.cfg'] };
  const before = await planMatchbotStartup(game, custom);
  await fs.appendFile(path.join(game, 'cstrike/cfg/host.cfg'), 'log on\n');
  const after = await planMatchbotStartup(game, custom);
  assert.notEqual(after.fingerprint, before.fingerprint);
  assert.equal(after.startupLogging, 'configured');
  const commandChanged = await planMatchbotStartup(game, { argv: [...custom.argv, '+log', 'on'] });
  assert.notEqual(commandChanged.fingerprint, after.fingerprint);
});

test('explicit log off, unsafe includes and symlinks fail closed without changing files', async t => {
  const { game } = await fixture(t);
  const config = path.join(game, 'cstrike/server.cfg');
  await fs.writeFile(config, 'log off\n');
  await assert.rejects(planMatchbotStartup(game, startup), /startup_logging_conflict/);
  assert.equal(await fs.readFile(config, 'utf8'), 'log off\n');
  await fs.writeFile(config, 'exec ../../private.cfg\n');
  await assert.rejects(planMatchbotStartup(game, startup), /invalid_matchbot_startup/);
  await fs.writeFile(config, 'hostname fixture\n');
  await fs.symlink('server.cfg', path.join(game, 'cstrike/game_init.cfg'));
  await assert.rejects(planMatchbotStartup(game, startup), /regular file/);
});

test('failed startup commit restores operator config without touching recovery marker', async t => {
  const { root, game } = await fixture(t);
  const original = 'bot_enable "1"\n';
  await fs.writeFile(path.join(game, 'cstrike/game_init.cfg'), original);
  await fs.mkdir(path.join(game, 'cstrike/addons/amxmodx/configs/mq2'), { recursive: true });
  const marker = path.join(game, 'cstrike/addons/amxmodx/configs/mq2/original-bots.txt');
  await fs.writeFile(marker, 'persistent recovery');
  const ino = (await fs.stat(marker)).ino;
  const review = await planMatchbotStartup(game, startup);
  await assert.rejects(commitMatchbotFiles(root, review.plan, async () => { throw new Error('fixture write fault'); }), /fixture write fault/);
  assert.equal(await fs.readFile(path.join(game, 'cstrike/game_init.cfg'), 'utf8'), original);
  assert.equal((await fs.stat(marker)).ino, ino);
  assert.equal(await fs.readFile(marker, 'utf8'), 'persistent recovery');
});
