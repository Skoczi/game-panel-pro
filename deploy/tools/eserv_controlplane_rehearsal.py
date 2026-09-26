#!/usr/bin/env python3
"""Recover FR1 data/images and verify real authentication without Docker, network or ports."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import time
import uuid


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode: raise RuntimeError('Restore check failed: ' + result.stderr[-1000:])
    return result.stdout


def main():
    os.umask(0o077)
    backups = Path('/mnt/ovh-backup/gamepanel-backups/control-plane')
    archive = sorted(backups.glob('fr1-*.tar.gz'))[-1]
    receipt = json.loads(archive.with_suffix(archive.suffix + '.json').read_text())
    with archive.open('rb') as source: assert hashlib.file_digest(source, 'sha256').hexdigest() == receipt['sha256']
    with tempfile.TemporaryDirectory(prefix='eserv-controlplane-restore-') as temporary:
        root = Path(temporary)
        with tarfile.open(archive) as bundle:
            for member in bundle.getmembers():
                path = Path(member.name)
                assert not path.is_absolute() and '..' not in path.parts and (member.isfile() or member.isdir())
                target = root / path
                if member.isdir(): target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.extractfile(member) as source, target.open('wb') as out: shutil.copyfileobj(source, out)
        manifest = json.loads((root / 'manifest.json').read_text())
        # These are FR1 panel image tags, separate from WAW2's live agent tags.
        assert all(i['reference'].startswith('gamepanel-pro-') for i in manifest['images'])
        run('docker', 'load', '-i', str(root / 'images.tar'))
        image = manifest['images'][0]['reference']
        assert json.loads(run('docker', 'image', 'inspect', image))[0]['Id'] == manifest['images'][0]['id']
        check = """
import {getDatabase,closeDatabase} from './dist/database/init.js';
import {getConfig} from './dist/config.js';
import {unseal} from './dist/nodes/protocol.js';
import {hashPassword} from './dist/utils/auth.js';
import {userRepository} from './dist/database/index.js';
import auth from './dist/routes/auth.js';
import express from 'express';
import {randomBytes} from 'node:crypto';
const db=await getDatabase();
const users=(await db.get('SELECT COUNT(*) AS n FROM users')).n;
const nodes=await db.all('SELECT id,key_encrypted FROM execution_nodes WHERE key_encrypted IS NOT NULL');
if(!users||!nodes.length)throw Error('Recovered accounts/nodes absent');
for(const node of nodes)if(unseal(node.key_encrypted,getConfig().jwtSecret,node.id).length!==43)throw Error('Node key cannot be recovered');
const password=randomBytes(16).toString('hex'),username='dr'+randomBytes(4).toString('hex');
await userRepository.create(username,await hashPassword(password));
const app=express();app.use(express.json());app.use('/api/auth',auth);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port+'/api/auth/';
try{
const response=await fetch(base+'login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
if(!response.ok)throw Error('Recovered authentication failed');
const {token}=await response.json();
if(!(await fetch(base+'me',{headers:{Authorization:'Bearer '+token}})).ok)throw Error('Recovered profile unavailable');
console.log(JSON.stringify({users,nodes:nodes.length,nodeCredentialsDecrypt:true,restoredAuthApi:true}));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await closeDatabase();}
"""
        environment = json.loads((root / 'compose.json').read_text())['services']['backend'].get('environment', {})
        assert isinstance(environment, dict)
        env_args = [part for key, value in environment.items() for part in ['-e', key + '=' + str(value)]]
        recovered = json.loads(run('docker', 'run', '--rm', '--network', 'none', '--memory', '512m', '--cpus', '1',
            '--env-file', str(root / 'backend.env'), *env_args, '-e', 'PORT=3001', '-e', 'GAMEPANEL_APP_ROOT=/restore-app',
            '--tmpfs', '/restore-app', '-v', str(root / 'data') + ':/data', '--entrypoint', 'node', image, '--input-type=module', '-e', check))
        report = {'archive': archive.name, 'sha256': receipt['sha256'], 'noNetwork': True,
            'noDockerSocket': True, 'noPublishedPorts': True, **recovered}
        Path('/var/lib/eserv-backups/restore-rehearsal.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))


if __name__ == '__main__': main()
