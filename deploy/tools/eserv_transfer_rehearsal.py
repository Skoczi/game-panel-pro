#!/usr/bin/env python3
"""WAW2: exercise transfer between two isolated HTTP agents on an isolated restored game."""
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
    tag, source_node, target_node = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    root = base / tag; root.mkdir()
    data = root / 'source/servers/8/data'; (data / 'serverfiles').mkdir(parents=True)
    (root / 'target').mkdir(); (root / 'control').mkdir()
    data.chmod(0o755); os.chown(data, 1000, 1000)
    network_name = 'eserv-transfer-' + tag
    network = api('POST', '/networks/create', {'Name': network_name, 'Internal': True})['Id']
    config = source['Config']
    clone = {key: config[key] for key in ['Image', 'Cmd', 'Entrypoint', 'Env', 'WorkingDir', 'User', 'StopSignal'] if key in config}
    clone['Image'] = source['Image']
    clone['Labels'] = {'eserv.restore-rehearsal': tag, 'gamepanel.managed': 'true', 'gamepanel.node': source_node}
    clone['HostConfig'] = {'NetworkMode': network_name, 'Binds': [str(data) + ':/data'], 'Memory': 512 * 1024**2, 'NanoCpus': 1000000000, 'PidsLimit': 128, 'RestartPolicy': {'Name': 'no'}}
    created = api('POST', '/containers/create?name=eserv-transfer-source-' + tag, clone)['Id']
    agent_image = 'eserv-transfer-candidate:20260926'
    worker = """
import {readFile} from 'node:fs/promises';
import {importExternalBackup} from './dist/services/externalBackups.js';
import {restoreNativeBackup} from './dist/services/nativeRestore.js';
const record=JSON.parse(await readFile('/restore-input/recovery.json','utf8'));
const server={id:8,runtime_uuid:record.runtimeUuid,provider:record.server.provider,provider_metadata_json:JSON.stringify(record.server.providerMetadata),docker_container_id:process.env.RESTORE_CONTAINER};
await importExternalBackup(server,record.name);
if(!(await restoreNativeBackup(server,record.name)).ok)throw new Error('Restore failed');
console.log('Isolated source restored');
"""
    completed = False
    try:
        common = ['-e','DOMAIN=restore.example','-e','PORT=3001','-e','JWT_SECRET=rehearsal-only',
            '-e','RESTORE_CONTAINER='+created,'-e','RESTORE_IMAGE='+source['Image'],
            '-v',str(root)+':'+str(root),'-v',str(record_file.parent)+':/restore-input:ro','-v','/var/run/docker.sock:/var/run/docker.sock']
        print(run('docker','run','--rm','-i','--network','none','--memory','1g','--cpus','1',*common,
            '-e','GAMEPANEL_APP_ROOT='+str(root / 'source'),'-e','GAMEPANEL_EXTERNAL_BACKUP_ROOT=/external-backups',
            '-v',str(external)+':/external-backups:ro','--entrypoint','node',agent_image,'--input-type=module',source=worker),flush=True)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        print(run('docker','run','--rm','--network',network_name,'--memory','2g','--cpus','2',*common,
            '-e','GAMEPANEL_APP_ROOT='+str(root / 'control'),'-e','REHEARSAL_ROOT='+str(root),
            '-e','SOURCE_NODE='+source_node,'-e','TARGET_NODE='+target_node,'-e','GAMEPANEL_TEST_LOOPBACK_NODES=1',
            '-e','GAMEPANEL_BIND_IPS=127.0.0.1','-e','CLONE_PORT='+str(port),'-e','GAMEPANEL_GAMES_NETWORK='+network_name,
            '--entrypoint','node',agent_image,'test/integration/transfer-rehearsal.mjs'),flush=True)
        after=api('GET','/containers/'+source_name+'/json')
        assert after['Id']==source['Id'] and after['State']['StartedAt']==source['State']['StartedAt']
        assert hashlib.sha256(original_cfg.read_bytes()).hexdigest()==cfg_hash
        report=json.loads((root / 'result.json').read_text())
        report.update(time=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),sourceUnchanged=True,physicalHosts=1,isolatedAgents=2,signedHttp=True)
        (base / (tag+'.json')).write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report),flush=True); completed=True
    finally:
        for item in api('GET','/containers/json?all=true'):
            if item.get('Labels',{}).get('gamepanel.node') in [source_node,target_node]: api('DELETE','/containers/'+item['Id']+'?force=true')
        api('DELETE','/networks/'+network)
        if completed:
            assert root.resolve().parent==base.resolve() and root.name==tag
            shutil.rmtree(root)

if __name__ == '__main__': main()
