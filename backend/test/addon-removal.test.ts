import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadWithMocks } from './loadWithMocks.js';
import { addonPath, REHLDS_MODULES } from '../src/services/rehldsPackages.js';
const safe = loadWithMocks('../src/services/rehldsAddons.ts', {
 'node:fs': { promises: fs }, 'node:path': path, 'node:crypto': await import('node:crypto'),
 './servers.js': {}, './rehldsContent.js': {}, '../utils/storage.js': {}, '../utils/docker.js': {}, './nativeBackups.js': {}, './nativeRestore.js': {},
 './rehldsPackages.js': { addonPath, REHLDS_MODULES }, './nativeRestoreJournal.js': { syncDirectory: async () => {} },
}, { Buffer });
const removal = loadWithMocks('../src/services/rehldsRemoval.ts', {
 'node:fs': { promises: fs }, 'node:path': path, 'node:crypto': await import('node:crypto'),
 './rehldsAddons.js': safe, './rehldsPackages.js': { REHLDS_MODULES }, './servers.js': {}, '../utils/storage.js': {},
 './nativeBackups.js': {}, './nativeRestore.js': {}, './nativeRestoreJournal.js': { syncDirectory: async () => {} },
});
test('removal deletes only the addon binary and registration, preserving configuration and other plugins', { skip: process.platform === 'win32' }, async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-remove-'));
 t.after(() => fs.rm(root, { recursive: true, force: true }));
 const binary = 'cstrike/addons/metamod/reunion/reunion_mm_i386.so';
 await fs.mkdir(path.dirname(path.join(root,binary)), { recursive: true });
 await fs.writeFile(path.join(root,binary), 'fixture');
 await fs.writeFile(path.join(root,'cstrike/addons/metamod/plugins.ini'), '; keep\nlinux addons/amxmodx/dlls/amxmodx_mm_i386.so\nlinux addons/metamod/reunion/reunion_mm_i386.so\n');
 await fs.writeFile(path.join(root,'cstrike/reunion.cfg'), 'private-auth-config');
 await fs.writeFile(path.join(root,'.gamepanel-addons.json'), JSON.stringify({ modules: { reunion: '0.2.0.25', amxx: '1.10' } }));
 await removal.stageAddonRemoval(root, 'reunion', 'verified-backup.tar.gz');
 await assert.rejects(fs.stat(path.join(root,binary)), { code: 'ENOENT' });
 assert.equal(await fs.readFile(path.join(root,'cstrike/reunion.cfg'),'utf8'), 'private-auth-config');
 assert.equal(await fs.readFile(path.join(root,'cstrike/addons/metamod/plugins.ini'),'utf8'), '; keep\nlinux addons/amxmodx/dlls/amxmodx_mm_i386.so\n');
 const record=JSON.parse(await fs.readFile(path.join(root,'.gamepanel-addons.json'),'utf8'));
 assert.deepEqual(record.modules,{amxx:'1.10'});
 assert.equal(record.backup,'verified-backup.tar.gz');
 await assert.rejects(removal.stageAddonRemoval(root,'rehlds','backup'), /restoring a backup/);
 await assert.rejects(removal.stageAddonRemoval(root,'__proto__','backup'), /restoring a backup/);
 const state = await removal.removalState(root,'amxx',{amxx:'1',reapi:'1'});
 assert.match(state.blocked,/ReAPI/);
 const meta = await removal.removalState(root,'metamod',{metamod:'1',amxx:'1'});
 assert.match(meta.blocked,/plugins first/);
});
