#!/usr/bin/env python3
"""Provision isolated SFTPGo on explicitly supplied game IPv4s, never 0.0.0.0.

No game account is created by this script. Credentials stay in root-only files.
Requires an existing eserv installation and administrator SSH access.
"""
import argparse, base64, ipaddress, json, os, secrets, shutil, subprocess, time, urllib.request
from pathlib import Path

IMAGE = 'drakkan/sftpgo@sha256:1edd28d80de2a008863fbfc58c8ff7db47b1b410bae48d4e6076192337809b11'
def run(*args): return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()
def write(path, data, mode=0o600):
    temp = path.with_suffix('.tmp'); temp.write_text(json.dumps(data, indent=2) + '\n'); temp.chmod(mode); temp.replace(path)

def main():
    p = argparse.ArgumentParser(); p.add_argument('--root', required=True, type=Path); p.add_argument('--backend', required=True); p.add_argument('--game-ip', action='append', required=True); p.add_argument('--node-ip', required=True); p.add_argument('--port', type=int, default=2023); p.add_argument('--resume', action='store_true')
    a = p.parse_args(); os.umask(0o077)
    root = a.root.resolve(); assert root in [Path('/opt/gamepanel-pro'), Path('/srv/eserv-agent'), Path('/srv/gamepanel-agent')]
    assert 1024 <= a.port <= 65535
    addresses = sorted(set(a.game_ip)); assert addresses and a.node_ip not in addresses
    for ip in addresses: assert ipaddress.IPv4Address(ip).is_global
    assert not (root / 'servers').is_symlink()
    backend = json.loads(run('docker', 'inspect', a.backend))[0]
    assert backend['Config']['Labels']['com.docker.compose.project.working_dir'] == str(root)
    before = {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker', 'inspect', *run('docker', 'ps', '-q').split())) if c['Name'] != '/eserv-sftp'}
    service = 'eserv-sftp'; network = 'eserv-sftp-control'
    dest = root / 'sftp'; dest.mkdir(exist_ok=True)
    assert a.resume or not (dest / 'compose.json').exists(), 'SFTP already configured; review before changing bindings'
    state = root / 'data/sftpgo'; state.mkdir(mode=0o700, exist_ok=a.resume); os.chown(state, 1000, 1000)
    if not (dest / 'backend-compose.before.json').exists(): shutil.copy2(root / 'compose.json', dest / 'backend-compose.before.json')
    # Grant traversal only: SFTPGo cannot list the root containing other servers.
    acl_backup = dest / 'servers-root.before.acl'
    if not acl_backup.exists():
        acl_backup.write_text(run('getfacl', '-p', str(root / 'servers')) + '\n'); acl_backup.chmod(0o600)
    run('setfacl', '-m', 'u:1000:--x', str(root / 'servers'))
    config = {
        'common': {'idle_timeout': 10, 'upload_mode': 0, 'max_total_connections': 80, 'max_per_host_connections': 12, 'umask': '0022', 'defender': {'enabled': True, 'driver': 'memory', 'ban_time': 15, 'ban_time_increment': 50, 'threshold': 6, 'score_invalid': 2, 'score_valid': 1, 'observation_time': 10, 'entries_soft_limit': 100, 'entries_hard_limit': 150}},
        'sftpd': {'bindings': [{'port': 2022, 'address': ''}], 'max_auth_tries': 3, 'enabled_ssh_commands': [], 'keyboard_interactive_authentication': False, 'password_authentication': True},
        'ftpd': {'bindings': [{'port': 0}]}, 'webdavd': {'bindings': [{'port': 0}]},
        'httpd': {'bindings': [{'port': 8080, 'address': '', 'enable_web_admin': False, 'enable_web_client': False, 'enable_rest_api': True, 'render_openapi': False}]},
        'data_provider': {'driver': 'sqlite', 'name': 'sftpgo.db', 'create_default_admin': True},
        'telemetry': {'bind_port': 0},
    }
    write(state / 'sftpgo.json', config, 0o640); os.chown(state / 'sftpgo.json', 1000, 1000)
    admin, secret = 'panel', secrets.token_urlsafe(36)
    env = dest / 'bootstrap.env'
    if env.exists():
        existing = dict(line.split('=',1) for line in env.read_text().splitlines()); secret = existing['SFTPGO_DEFAULT_ADMIN_PASSWORD']
    env.write_text(f'SFTPGO_DEFAULT_ADMIN_USERNAME={admin}\nSFTPGO_DEFAULT_ADMIN_PASSWORD={secret}\n'); env.chmod(0o600)
    run('docker', 'pull', IMAGE)
    if not a.resume: run('docker', 'network', 'create', network)
    compose = {'services': {'sftp': {'image': IMAGE, 'container_name': service, 'user': '1000:1000', 'restart': 'unless-stopped', 'read_only': True, 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'], 'pids_limit': 128, 'mem_limit': '512m', 'cpus': 1,
      'env_file': [str(env)], 'environment': {'SFTPGO_CONFIG_DIR': '/var/lib/sftpgo', 'SFTPGO_LOG_LEVEL': 'info'}, 'tmpfs': ['/tmp:rw,noexec,nosuid,size=64m'],
      'volumes': [f'{state}:/var/lib/sftpgo', f'{root}/servers:/servers'], 'ports': [f'{ip}:{a.port}:2022/tcp' for ip in addresses], 'networks': ['sftp-control'],
      'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}}}}, 'networks': {'sftp-control': {'external': True, 'name': network}}}
    write(dest / 'compose.json', compose)
    subprocess.run(['docker','compose','-p','eserv-sftp','-f',str(dest/'compose.json'),'up','-d'],check=True,stdout=subprocess.DEVNULL)
    service_info = json.loads(run('docker','inspect',service))[0]
    service_ip = service_info['NetworkSettings']['Networks'][network]['IPAddress']
    def api(endpoint):
        headers = {'Authorization': 'Basic ' + base64.b64encode(f'{admin}:{secret}'.encode()).decode()}
        token = json.load(urllib.request.urlopen(urllib.request.Request(f'http://{service_ip}:8080/api/v2/token', headers=headers), timeout=4))['access_token']
        return json.load(urllib.request.urlopen(urllib.request.Request(f'http://{service_ip}:8080/api/v2{endpoint}', headers={'Authorization':'Bearer '+token}),timeout=4))
    status = None
    for _ in range(20):
        try: status = api('/status'); break
        except Exception: time.sleep(1)
    assert status is not None, 'SFTP failed its private API health check'
    # Keep the private API off the public host interfaces and games network.
    assert all(port == '2022/tcp' or not bindings for port, bindings in service_info['NetworkSettings']['Ports'].items())
    assert not service_info['NetworkSettings']['Ports'].get('8080/tcp')
    key = '\n'.join(', '.join(k['algorithms']) + ' · ' + k['fingerprint'] for k in status['ssh']['host_keys'])
    write(root/'data/sftp-service.json', {'apiUrl': f'http://{service}:8080', 'admin': admin, 'secret': secret, 'port': a.port, 'publicIps': addresses, 'fingerprint': key})
    original = json.loads((root/'compose.json').read_text()); service_name = backend['Config']['Labels']['com.docker.compose.service']
    original.setdefault('networks',{})['sftp-control'] = {'external': True, 'name': network}
    nets = original['services'][service_name].setdefault('networks', ['default'])
    if isinstance(nets,list):
        if 'sftp-control' not in nets: nets.append('sftp-control')
    else: nets['sftp-control'] = {}
    write(root/'compose.json', original)
    if network not in backend['NetworkSettings']['Networks']: run('docker','network','connect',network,a.backend)
    after = {c['Id']: c['State']['StartedAt'] for c in json.loads(run('docker','inspect',*before))}
    assert before == after, 'Existing containers changed during SFTP provisioning'
    print(json.dumps({'configured':True,'gameIps':addresses,'port':a.port,'hostFingerprint':key,'existingContainersUnchanged':True,'publicAdminApi':False}))

if __name__ == '__main__': main()
