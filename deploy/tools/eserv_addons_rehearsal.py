#!/usr/bin/env python3
"""WAW2: isolated addon installation and rollback rehearsal; never changes the source game."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import uuid


class DockerConnection(http.client.HTTPConnection):
    def __init__(self): super().__init__('localhost')
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')


def api(method, path, body=None):
    conn = DockerConnection()
    conn.request(method, '/v1.45' + path, None if body is None else json.dumps(body), {'Content-Type': 'application/json'})
    res = conn.getresponse(); value = res.read(); conn.close()
    if res.status >= 300: raise RuntimeError('Docker operation failed: ' + path + ' status ' + str(res.status))
    return json.loads(value) if value else None


def run(*args, source=None):
    result = subprocess.run(args, input=source, text=True, capture_output=True)
    if result.returncode: raise RuntimeError('Rehearsal command failed: ' + result.stderr[-1800:])
    return result.stdout


def main():
    os.umask(0o077)
    source_name = 'gp-0089c856-8a20-42db-add8-6ac31ac3fe2f-zajebisty-serwer-8'
    source = api('GET', '/containers/' + source_name + '/json')
    assert source['State']['Running']
    original_cfg = Path('/srv/gamepanel-agent/servers/8/data/serverfiles/cstrike/server.cfg')
    cfg_hash = hashlib.sha256(original_cfg.read_bytes()).hexdigest()
    external = Path('/mnt/ovh-backup/gamepanel-backups')
    records = []
    for file in external.glob('gamepanel-v1/*/native-*/recovery.json'):
        value = json.loads(file.read_text())
        if value['server']['id'] == 8 and value['server']['name'] == 'Zajebisty serwer': records.append((value['createdAt'], file, value))
    _, record_file, record = max(records)
    base = Path('/srv/gamepanel-agent/restore-tests'); base.mkdir(exist_ok=True)
    tag = str(uuid.uuid4()); root = base / tag; root.mkdir()
    data = root / 'servers/8/data'; (data / 'serverfiles').mkdir(parents=True)
    data.chmod(0o755); os.chown(data, 1000, 1000)
    name = 'eserv-restore-' + tag
    config = source['Config']
    clone = {key: config[key] for key in ['Image', 'Cmd', 'Entrypoint', 'Env', 'WorkingDir', 'User', 'StopSignal'] if key in config}
    clone['Image'] = source['Image']
    clone['OpenStdin'] = True
    clone['StdinOnce'] = False
    clone['Labels'] = {'eserv.restore-rehearsal': tag}
    clone['HostConfig'] = {'NetworkMode': 'none', 'Binds': [str(data) + ':/data'], 'Memory': 512 * 1024**2, 'NanoCpus': 1000000000, 'PidsLimit': 128, 'RestartPolicy': {'Name': 'no'}}
    created = api('POST', '/containers/create?name=' + name, clone)['Id']
    agent = api('GET', '/containers/gp-0089c856-8a20-42db-add8-6ac31ac3fe2f-agent-1/json')
    agent_image = 'eserv-rehlds-candidate:20260926'
    worker = """
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { downloadAddonFiles, REHLDS_MODULES } from './dist/services/rehldsPackages.js';
import { stageAddonFiles } from './dist/services/rehldsAddons.js';
import { importExternalBackup } from './dist/services/externalBackups.js';
import { restoreNativeBackup } from './dist/services/nativeRestore.js';
const record=JSON.parse(await readFile('/restore-input/recovery.json','utf8'));
const server={id:8,runtime_uuid:record.runtimeUuid,provider:record.server.provider,
 provider_metadata_json:JSON.stringify(record.server.providerMetadata),docker_container_id:process.env.RESTORE_CONTAINER};
if(process.env.ADDON_PHASE === 'install') {
 await importExternalBackup(server,record.name);
 const modules=REHLDS_MODULES.map(m=>m.id), files=await downloadAddonFiles(modules);
 const installed=await restoreNativeBackup(server,record.name,false,async staging=>stageAddonFiles(path.join(staging,'serverfiles'),files,modules,Object.fromEntries(REHLDS_MODULES.map(m=>[m.id,m.version])),record.name));
 if(!installed.ok)throw new Error('Addon staging failed');
} else {
 const result=await restoreNativeBackup(server,record.name);
 if(!result.ok)throw new Error('Rollback failed');
}
console.log(JSON.stringify({importChecksumVerified:true,restoreCompleted:true,phase:process.env.ADDON_PHASE}));
"""
    completed = False
    try:
        def apply(phase):
            print(run('docker', 'run', '--rm', '-i', '--network', 'bridge', '--memory', '1g', '--cpus', '1',
                '-e', 'ADDON_PHASE=' + phase, '-e', 'DOMAIN=restore.example', '-e', 'PORT=3001', '-e', 'JWT_SECRET=rehearsal-only',
                '-e', 'GAMEPANEL_APP_ROOT=' + str(root), '-e', 'GAMEPANEL_EXTERNAL_BACKUP_ROOT=/external-backups', '-e', 'RESTORE_CONTAINER=' + created,
                '-v', str(root) + ':' + str(root), '-v', str(external) + ':/external-backups:ro',
                '-v', str(record_file.parent) + ':/restore-input:ro', '-v', '/var/run/docker.sock:/var/run/docker.sock',
                '--entrypoint', 'node', agent_image, '--input-type=module', source=worker), flush=True)
        apply('install')
        api('POST', '/containers/' + created + '/start')
        ports = [int(key.split('/')[0]) for key in source['HostConfig']['PortBindings'] if key.endswith('/udp')]
        assert ports
        probe = "import {queryGame} from './dist/services/gameQuery.js'; console.log(JSON.stringify(await queryGame('127.0.0.1'," + str(ports[0]) + ",1500)));"
        result = None
        for attempt in range(20):
            try:
                result = json.loads(run('docker', 'run', '--rm', '--network', 'container:' + created, '--memory', '128m', '--entrypoint', 'node', agent_image, '--input-type=module', '-e', probe))
                break
            except RuntimeError:
                if attempt == 19: raise
                time.sleep(2)
        console_probe = "import Docker from 'dockerode'; const d=new Docker(); const s=await d.getContainer(process.env.TARGET).attach({stream:true,stdin:true,stdout:false,stderr:false}); s.write('meta list\\namxx modules\\nversion\\n'); await new Promise(r=>setTimeout(r,2000)); s.destroy();"
        run('docker','run','--rm','--network','none','-v','/var/run/docker.sock:/var/run/docker.sock','-e','TARGET='+created,'--entrypoint','node',agent_image,'--input-type=module','-e',console_probe)
        game_log = run('docker', 'logs', created)
        for marker in ['Metamod-r', 'AMX Mod X', 'ReGameDLL', 'Reunion', 'ReAPI']:
            if marker.lower() not in game_log.lower(): raise RuntimeError('Missing loaded module: ' + marker + '\n' + game_log[-4000:])
        if 'failed to load' in game_log.lower(): raise RuntimeError('Module load failure: ' + game_log[-4000:])
        installed_info = result['info']
        api('POST', '/containers/' + created + '/stop?t=15')
        apply('rollback')
        assert not (data / 'serverfiles/.gamepanel-addons.json').exists()
        api('POST', '/containers/' + created + '/start')
        for attempt in range(20):
            try:
                result = json.loads(run('docker', 'run', '--rm', '--network', 'container:' + created, '--memory', '128m', '--entrypoint', 'node', agent_image, '--input-type=module', '-e', probe))
                break
            except RuntimeError:
                if attempt == 19: raise
                time.sleep(2)
        after = api('GET', '/containers/' + source_name + '/json')
        assert after['Id'] == source['Id'] and after['State']['StartedAt'] == source['State']['StartedAt']
        assert hashlib.sha256(original_cfg.read_bytes()).hexdigest() == cfg_hash
        assert result['info']['players'] == 0
        report = {'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'archive': record['name'], 'sha256': record['sha256'], 'restoredFrom': 'OVH NFS', 'sourceUnchanged': True, 'addonsInstalledAndBooted': True, 'rollbackBooted': True, 'installedGame': installed_info, 'isolatedNetwork': True, 'publishedPorts': False, 'game': result['info']}
        (base / (tag + '.json')).write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report), flush=True); completed = True
    finally:
        api('DELETE', '/containers/' + created + '?force=true')
        if completed:
            assert root.resolve().parent == base.resolve() and root.name == tag
            shutil.rmtree(root)


if __name__ == '__main__': main()
