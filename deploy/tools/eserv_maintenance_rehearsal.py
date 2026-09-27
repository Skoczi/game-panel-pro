#!/usr/bin/env python3
"""WAW2: exercise a scheduled maintenance workflow on an isolated restored game."""
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
    name = 'eserv-maintenance-' + tag
    network_name = 'gp-' + tag + '-games'
    network = api('POST', '/networks/create', {'Name': network_name, 'Internal': True})['Id']
    config = source['Config']
    clone = {key: config[key] for key in ['Image', 'Cmd', 'Entrypoint', 'Env', 'WorkingDir', 'User', 'StopSignal'] if key in config}
    clone['Image'] = source['Image']
    clone['Labels'] = {'eserv.restore-rehearsal': tag, 'gamepanel.managed': 'true', 'gamepanel.node': tag}
    clone['HostConfig'] = {'NetworkMode': network_name, 'Binds': [str(data) + ':/data'], 'Memory': 512 * 1024**2, 'NanoCpus': 1000000000, 'PidsLimit': 128, 'RestartPolicy': {'Name': 'no'}}
    created = api('POST', '/containers/create?name=' + name, clone)['Id']
    agent = api('GET', '/containers/gp-0089c856-8a20-42db-add8-6ac31ac3fe2f-agent-1/json')
    agent_image = 'eserv-maintenance-candidate:20260926'
    worker = """
import { readFile } from 'node:fs/promises';
import { importExternalBackup } from './dist/services/externalBackups.js';
import { restoreNativeBackup } from './dist/services/nativeRestore.js';
const record=JSON.parse(await readFile('/restore-input/recovery.json','utf8'));
const server={id:8,runtime_uuid:record.runtimeUuid,provider:record.server.provider,
 provider_metadata_json:JSON.stringify(record.server.providerMetadata),docker_container_id:process.env.RESTORE_CONTAINER};
await importExternalBackup(server,record.name);
const result=await restoreNativeBackup(server,record.name);
if(!result.ok)throw new Error('Restore failed');
console.log(JSON.stringify({importChecksumVerified:true,restoreCompleted:true}));
"""
    completed = False
    try:
        print(run('docker', 'run', '--rm', '-i', '--network', 'none', '--memory', '1g', '--cpus', '1',
            '-e', 'DOMAIN=restore.example', '-e', 'PORT=3001', '-e', 'JWT_SECRET=rehearsal-only',
            '-e', 'GAMEPANEL_APP_ROOT=' + str(root), '-e', 'GAMEPANEL_EXTERNAL_BACKUP_ROOT=/external-backups', '-e', 'RESTORE_CONTAINER=' + created,
            '-v', str(root) + ':' + str(root), '-v', str(external) + ':/external-backups:ro',
            '-v', str(record_file.parent) + ':/restore-input:ro', '-v', '/var/run/docker.sock:/var/run/docker.sock',
            '--entrypoint', 'node', agent_image, '--input-type=module', source=worker), flush=True)
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
        maintenance = """
import {readFile} from 'node:fs/promises';
import {initializeDatabase,closeDatabase} from './dist/database/init.js';
import {runDueScheduledTasks} from './dist/services/scheduledTasks.js';
import {maintenanceRuns} from './dist/services/maintenanceWorkflow.js';
import {configureMonitoring} from './dist/services/gameMonitoring.js';
const db=await initializeDatabase(), record=JSON.parse(await readFile('/restore-input/recovery.json','utf8')), s=record.server, now=new Date().toISOString();
await db.run(`INSERT INTO game_servers(id,runtime_uuid,name,provider,docker_image,docker_container_id,ports_json,mounts_json,env_json,runtime_config_json,provider_metadata_json,status,desired_state,created_at,updated_at) VALUES(8,?,?,?,?,?,?,?,?,?,?,'running','running',?,?)`, record.runtimeUuid,'Maintenance rehearsal',s.provider,s.dockerImage,process.env.RESTORE_CONTAINER,JSON.stringify(s.ports),JSON.stringify(s.mounts),JSON.stringify(s.environment),JSON.stringify(s.runtimeConfig),JSON.stringify(s.providerMetadata),now,now);
await db.run(`INSERT INTO server_scheduled_tasks(id,server_id,type,schedule,enabled,payload_json,next_run_at,created_at,updated_at) VALUES(1,8,'restart','0 5 * * *',1,?,?,?,?)`,JSON.stringify({maintenance:{version:1,update:false,healthTimeoutSeconds:120}}),'2000-01-01T00:00:00.000Z',now,now);
await configureMonitoring(8,{enabled:true,protocol:'a2s',queryPort:s.ports.udp[0].container,intervalSeconds:30,startupGraceSeconds:0,failureThreshold:3},'rehearsal');
await runDueScheduledTasks();
const run=(await maintenanceRuns(8))[0], task=await db.get('SELECT last_status FROM server_scheduled_tasks WHERE id=1');
if(run?.status!=='success'||task.last_status!=='success')throw new Error('Maintenance failed: '+JSON.stringify(run));
console.log(JSON.stringify({maintenance:true,status:run.status,steps:run.steps.map(s=>({name:s.name,status:s.status})),backup:run.backup}));
await closeDatabase();
"""
        print(run('docker','run','--rm','-i','--network',network_name,'--memory','1g','--cpus','1',
            '-e','DOMAIN=restore.example','-e','PORT=3001','-e','JWT_SECRET=rehearsal-only','-e','GAMEPANEL_APP_ROOT='+str(root),
            '-e','GAMEPANEL_NODE_ID='+tag,'-e','GAMEPANEL_GAMES_NETWORK='+network_name,'-e','RESTORE_CONTAINER='+created,
            '-v',str(root)+':'+str(root),'-v',str(record_file.parent)+':/restore-input:ro',
            '-v','/var/run/docker.sock:/var/run/docker.sock','--entrypoint','node',agent_image,'--input-type=module',source=maintenance),flush=True)
        after = api('GET', '/containers/' + source_name + '/json')
        assert after['Id'] == source['Id'] and after['State']['StartedAt'] == source['State']['StartedAt']
        assert hashlib.sha256(original_cfg.read_bytes()).hexdigest() == cfg_hash
        assert result['info']['players'] == 0
        report = {'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'archive': record['name'], 'sha256': record['sha256'], 'restoredFrom': 'OVH NFS', 'sourceUnchanged': True, 'maintenanceVerified': True, 'updateRecipeExecuted': False, 'isolatedNetwork': True, 'publishedPorts': False, 'game': result['info']}
        (base / (tag + '.json')).write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report), flush=True); completed = True
    finally:
        api('DELETE', '/containers/' + created + '?force=true')
        api('DELETE', '/networks/' + network)
        if completed:
            assert root.resolve().parent == base.resolve() and root.name == tag
            shutil.rmtree(root)


if __name__ == '__main__': main()
