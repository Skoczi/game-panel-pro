#!/usr/bin/env python3
"""WAW2: exercise a same-node clone on an isolated restored game."""
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
    name = 'eserv-clone-' + tag
    network_name = 'gp-' + tag + '-games'
    network = api('POST', '/networks/create', {'Name': network_name, 'Internal': True})['Id']
    config = source['Config']
    clone = {key: config[key] for key in ['Image', 'Cmd', 'Entrypoint', 'Env', 'WorkingDir', 'User', 'StopSignal'] if key in config}
    clone['Image'] = source['Image']
    clone['Labels'] = {'eserv.restore-rehearsal': tag, 'gamepanel.managed': 'true', 'gamepanel.node': tag}
    clone['HostConfig'] = {'NetworkMode': network_name, 'Binds': [str(data) + ':/data'], 'Memory': 512 * 1024**2, 'NanoCpus': 1000000000, 'PidsLimit': 128, 'RestartPolicy': {'Name': 'no'}}
    created = api('POST', '/containers/create?name=' + name, clone)['Id']
    agent = api('GET', '/containers/gp-0089c856-8a20-42db-add8-6ac31ac3fe2f-agent-1/json')
    agent_image = 'eserv-clone-candidate:20260926'
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
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as port_socket:
            port_socket.bind(('127.0.0.1', 0)); clone_port = port_socket.getsockname()[1]
        worker_clone = """
import {readFile} from 'node:fs/promises';
import {initializeDatabase,closeDatabase} from './dist/database/init.js';
import {serverRepository} from './dist/database/index.js';
import {previewClone,cloneServer} from './dist/services/serverClone.js';
import {startBackupJob,readBackupJob} from './dist/services/backupJobs.js';
import {stopContainer,startContainer} from './dist/utils/docker.js';
import {docker} from './dist/utils/docker/client.js';
import {queryGame} from './dist/services/gameQuery.js';
const db=await initializeDatabase(), record=JSON.parse(await readFile('/restore-input/recovery.json','utf8')), s=record.server, now=new Date().toISOString();
await db.run(`INSERT INTO game_servers(id,runtime_uuid,name,provider,docker_image,docker_image_digest,docker_container_id,ports_json,mounts_json,env_json,runtime_config_json,provider_metadata_json,status,desired_state,created_at,updated_at) VALUES(8,?,?,?,?,?,?,?,?,?,?,?,'stopped','stopped',?,?)`, record.runtimeUuid,'Clone source rehearsal',s.provider,s.dockerImage,process.env.RESTORE_IMAGE,process.env.RESTORE_CONTAINER,JSON.stringify(s.ports),JSON.stringify(s.mounts),JSON.stringify(s.environment),JSON.stringify(s.runtimeConfig),JSON.stringify(s.providerMetadata),now,now);
await stopContainer(process.env.RESTORE_CONTAINER);
const preview=await previewClone(8,record.runtimeUuid), ports=JSON.parse(JSON.stringify(preview.ports));
for(const protocol of ['tcp','udp'])for(let i=0;i<ports[protocol].length;i++){ports[protocol][i].host=Number(process.env.CLONE_PORT)+i;ports[protocol][i].hostIp='127.0.0.1';}
const job=await startBackupJob(8,'clone','rehearsal',()=>cloneServer(8,record.runtimeUuid,{name:'Isolated clone',ports,fingerprint:preview.fingerprint},'rehearsal'));
let result;
for(let i=0;i<600;i++){result=await readBackupJob(8,job.id);if(result.status!=='running')break;await new Promise(r=>setTimeout(r,1000));}
if(result.status!=='completed')throw new Error('Clone job failed: '+result.error);
const clone=await serverRepository.findById(result.result.targetServerId);
if(!clone||clone.runtime_uuid===record.runtimeUuid||clone.desired_state!=='stopped')throw new Error('Invalid clone identity/state');
await startContainer(clone.docker_container_id);
const runtime=await docker.getContainer(clone.docker_container_id).inspect(), address=runtime.NetworkSettings.Networks[process.env.GAMEPANEL_GAMES_NETWORK].IPAddress;
let info;
for(let i=0;i<30;i++){try{info=await queryGame(address,s.ports.udp[0].container,1000);break;}catch{await new Promise(r=>setTimeout(r,1000));}}
if(!info)throw new Error('Cloned game did not answer');
console.log(JSON.stringify({cloneJob:result.status,newIdentity:true,newPorts:true,gameAnswered:true,sourceStopped:!(await docker.getContainer(process.env.RESTORE_CONTAINER).inspect()).State.Running}));
await closeDatabase();
"""
        print(run('docker','run','--rm','-i','--network',network_name,'--memory','1g','--cpus','1',
            '-e','DOMAIN=restore.example','-e','PORT=3001','-e','JWT_SECRET=rehearsal-only','-e','GAMEPANEL_APP_ROOT='+str(root),
            '-e','GAMEPANEL_NODE_ID='+tag,'-e','GAMEPANEL_GAMES_NETWORK='+network_name,'-e','RESTORE_CONTAINER='+created,
            '-e','GAMEPANEL_BIND_IPS=127.0.0.1','-e','RESTORE_IMAGE='+source['Image'],'-e','CLONE_PORT='+str(clone_port),
            '-v',str(root)+':'+str(root),'-v',str(record_file.parent)+':/restore-input:ro',
            '-v','/var/run/docker.sock:/var/run/docker.sock','--entrypoint','node',agent_image,'--input-type=module',source=worker_clone),flush=True)
        after = api('GET', '/containers/' + source_name + '/json')
        assert after['Id'] == source['Id'] and after['State']['StartedAt'] == source['State']['StartedAt']
        assert hashlib.sha256(original_cfg.read_bytes()).hexdigest() == cfg_hash
        assert result['info']['players'] == 0
        report = {'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'archive': record['name'], 'sha256': record['sha256'], 'restoredFrom': 'OVH NFS', 'sourceUnchanged': True, 'cloneVerified': True, 'isolatedNetwork': True, 'publishedPorts': 'clone loopback only', 'game': result['info']}
        (base / (tag + '.json')).write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report), flush=True); completed = True
    finally:
        for item in api('GET', '/containers/json?all=true'):
            if item.get('Labels', {}).get('gamepanel.node') == tag:
                api('DELETE', '/containers/' + item['Id'] + '?force=true')
        api('DELETE', '/networks/' + network)
        if completed:
            assert root.resolve().parent == base.resolve() and root.name == tag
            shutil.rmtree(root)


if __name__ == '__main__': main()
