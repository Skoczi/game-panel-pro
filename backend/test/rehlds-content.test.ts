import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadWithMocks } from './loadWithMocks.js';
import { addonPath, selectedModules, REHLDS_MODULES } from '../src/services/rehldsPackages.js';

const content = loadWithMocks('../src/services/rehldsContent.ts', {
  './gameAdminEntries.js': {},
  'node:fs': { promises: fs }, 'node:path': path, '../utils/fsBrowser.js': {}, './nativeGameConfig.js': {}, './servers.js': {}, './fileExplorer.js': {}, './atomicFile.js': {}, './fileHistory.js': {}, '../utils/storage.js': {},
}, { Buffer });
test('ReHLDS configuration rejects command injection, missing maps and unsupported admin authentication', () => {
  const validate = content.validateRehldsContent;
  assert.equal(validate('rotation', '// rotation\nde_dust2\n', ['de_dust2']), '// rotation\nde_dust2\n');
  assert.throws(() => validate('rotation', 'de_dust2; quit', ['de_dust2']));
  assert.throws(() => validate('rotation', 'missing', ['de_dust2']));
  assert.equal(validate('admins', '"STEAM_0:1:12345" "" "bcdefiju" "ce"', []), '"STEAM_0:1:12345" "" "bcdefiju" "ce"\n');
  assert.throws(() => validate('admins', '"name" "password" "a" "a"', []));
  assert.throws(() => validate('plugins', '../external.amxx', ['../external.amxx']));
  assert.equal(validate('plugins', '; disabled.amxx\nadmin.amxx debug', ['admin.amxx']), '; disabled.amxx\nadmin.amxx debug\n');
});
test('module selection closes dependencies and rejects arbitrary downloads or paths', () => {
  assert.deepEqual(selectedModules(['reapi']), ['rehlds', 'metamod', 'amxx', 'regamedll', 'reapi']);
  assert.throws(() => selectedModules(['https://example.org/evil.zip']));
  for (const filename of ['/etc/passwd', 'addons/../evil', 'a\\b', './a']) assert.throws(() => addonPath(filename));
});
test('addon staging preserves settings, appends missing loader and does not duplicate registration', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rehlds-stage-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { stageAddonFiles } = loadWithMocks('../src/services/rehldsAddons.ts', {
    'node:fs': { promises: { ...fs, chown: async () => {} } }, 'node:path': path, 'node:crypto': await import('node:crypto'),
    './servers.js': {}, './rehldsContent.js': {}, '../utils/storage.js': {}, '../utils/docker.js': {}, './nativeBackups.js': {}, './nativeRestore.js': {},
    './rehldsPackages.js': { addonPath, REHLDS_MODULES }, './nativeRestoreJournal.js': { syncDirectory: async () => {} },
    './addonFiles.js': await import('../src/services/addonFiles.js'),
  }, { Buffer });
  await fs.mkdir(path.join(root, 'cstrike'), { recursive: true });
  await fs.writeFile(path.join(root, 'cstrike/liblist.gam'), 'game "Counter-Strike"\n');
  await fs.writeFile(path.join(root, 'cstrike/reunion.cfg'), 'SteamIdHashSalt = existing-private-salt\n');
  const files = new Map([['cstrike/addons/metamod/metamod_i386.so', Buffer.from('fixture')], ['cstrike/reunion.cfg', Buffer.from('SteamIdHashSalt = default\n')]]);
  await stageAddonFiles(root, files, ['metamod', 'reunion'], { metamod: 'fixture' }, 'backup.tar.gz');
  await stageAddonFiles(root, files, ['metamod', 'reunion'], { metamod: 'fixture' }, 'backup.tar.gz');
  assert.equal((await fs.readFile(path.join(root, 'cstrike/liblist.gam'), 'utf8')).match(/gamedll_linux/g)?.length, 1);
  assert.equal((await fs.readFile(path.join(root, 'cstrike/addons/metamod/plugins.ini'), 'utf8')).match(/reunion_mm/g)?.length, 1);
  assert.equal(await fs.readFile(path.join(root, 'cstrike/reunion.cfg'), 'utf8'), 'SteamIdHashSalt = existing-private-salt\n');
  if (process.platform !== 'win32') {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'rehlds-outside-')); t.after(() => fs.rm(outside, { recursive: true, force: true }));
    await fs.symlink(outside, path.join(root, 'cstrike/escape'));
    await assert.rejects(stageAddonFiles(root, new Map([['cstrike/escape/file', Buffer.from('x')]]), [], {}, 'backup'), /link/);
    assert.deepEqual(await fs.readdir(outside), []);
  }
});
