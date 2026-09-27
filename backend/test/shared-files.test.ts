import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { importSharedZip, resolveSharedPath, preflightSharedMounts, sharedReference, sharedDependencies, verifySharedBackup, beginSharedUpload, sharedUploadChunk, cancelSharedUpload } from '../src/services/sharedFiles.js';
import { CLASSIC_OFFENSIVE_TEMPLATE } from '../src/templates/classicOffensive.js';
import { validateTemplate, templateHash } from '../src/templates/schema.js';
import { normalizeMountsPayload } from '../src/utils/mounts.js';
import { sourceProfile } from '../src/templates/sourceProfile.js';
import { sourceModuleVersion } from '../src/services/sourcePackages.js';
import { runtimePath } from '../src/nodes/protocol.js';

test('Classic template preserves package identity and selects the verified mod path/frameworks', () => {
  const template = validateTemplate(CLASSIC_OFFENSIVE_TEMPLATE);
  assert.equal(templateHash(template), templateHash(validateTemplate(template)));
  assert.deepEqual(normalizeMountsPayload(template.mounts), template.mounts);
  assert.equal(sourceProfile(template)?.base, 'serverfiles/csco/csgo');
  assert.equal(sourceModuleVersion('classic','metamod'), '2.0.0.1350');
  assert.equal(sourceModuleVersion('classic','sourcemod'), '1.13.0.7243');
  assert.equal(template.mounts.filter(m=>m.shared).length,5);
  assert.equal(template.variables.find(v=>v.key==='MAP')?.default,'de_dust2_csco');
  const invalid=structuredClone(template);invalid.mounts[0].shared=template.mounts[1].shared;
  assert.throws(()=>validateTemplate(invalid),/separate native mount/);
  for (const p of ['../bin','/etc','bin/../cfg','bin\\cfg']) assert.throws(()=>sharedReference({...template.mounts[1].shared,path:p}));
  assert.equal(runtimePath('/api/system/shared-files/uploads/abc/finish'),true);
  assert.equal(runtimePath('/api/system/shared-files/../../users'),false);
});

test('ZIP import is immutable, streamed, rejects links/traversal and restores only matching dependencies', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'shared-files-test-'));
  const previous=process.env.GAMEPANEL_SHARED_FILES_ROOT;process.env.GAMEPANEL_SHARED_FILES_ROOT=root;
  try {
    const zip=path.join(root,'game.zip');
    await promisify(execFile)('python3',['-c',`import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n z.writestr('Game/bin/engine.so','test engine')\n z.writestr('Game/config/server.cfg','hostname test')`,zip]);
    const pkg=await importSharedZip(zip,{id:'test-1',name:'Game',version:'1',root:'Game'});
    const ref={package:pkg.id,sha256:pkg.sha256,path:'bin'};
    assert.equal(await fs.readFile(path.join(await resolveSharedPath(ref),'engine.so'),'utf8'),'test engine');
    await assert.rejects(importSharedZip(zip,{id:'test-1',name:'Game',version:'1'}),/already exists/);
    await assert.rejects(resolveSharedPath({...ref,sha256:'0'.repeat(64)}),/checksum/);
    await assert.rejects(preflightSharedMounts([{shared:{...ref,package:'missing'}}]),/missing/);
    const data=path.join(root,'private');await fs.mkdir(data);
    const mounts=[{shared:ref}];
    await assert.rejects(verifySharedBackup(mounts,data),/manifest is missing/);
    await fs.writeFile(path.join(data,'.eserv-shared-files.json'),JSON.stringify(sharedDependencies(mounts)));
    await verifySharedBackup(mounts,data);
    await assert.rejects(verifySharedBackup([],data),/different shared/);
    for(const [id,name,mode] of [['escape','../escape',0o100644],['symlink','Game/bin/link',0o120777]]) {
      const bad=path.join(root,`${id}.zip`);
      await promisify(execFile)('python3',['-c',`import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1],'w');i=zipfile.ZipInfo(sys.argv[2]);i.create_system=3;i.external_attr=int(sys.argv[3])<<16;z.writestr(i,'outside');z.close()`,bad,String(name),String(mode)]);
      await assert.rejects(importSharedZip(bad,{id:String(id),name:'Bad',version:'1'}));
      await assert.rejects(fs.stat(path.join(root,'packages',String(id))));
    }
    const upload=await beginSharedUpload({id:'uploaded',name:'Upload',version:'1',total:24});
    await assert.rejects(sharedUploadChunk(upload.id,1,'AAAA'),/offset/);
    assert.equal((await sharedUploadChunk(upload.id,0,'AAAA')).offset,3);
    await cancelSharedUpload(upload.id);
    await assert.rejects(fs.stat(path.join(root,'inbox',upload.id+'.zip')));
  } finally { if(previous===undefined)delete process.env.GAMEPANEL_SHARED_FILES_ROOT;else process.env.GAMEPANEL_SHARED_FILES_ROOT=previous;await fs.rm(root,{recursive:true,force:true}); }
});
