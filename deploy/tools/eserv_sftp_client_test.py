"""External protocol test; credentials only read from a private handoff, never logged."""
import base64, hashlib, json, socket, subprocess, sys, time
from pathlib import Path
import paramiko

handoff=Path(sys.argv[1]);data=json.loads(handoff.read_text())
def connect(password):
    transport=paramiko.Transport((data['host'],data['port']));transport.start_client(timeout=8)
    fingerprint='SHA256:'+base64.b64encode(hashlib.sha256(transport.get_remote_server_key().asbytes()).digest()).decode().rstrip('=')
    assert fingerprint in data['fingerprint'], 'Unexpected SSH host key'
    try: transport.auth_password(data['username'],password)
    except Exception: transport.close();raise
    return transport,paramiko.SFTPClient.from_transport(transport)
def remote(action):
    subprocess.run(['ssh','waw2','sudo python3 /tmp/eserv_sftp_acceptance.py '+action],check=True)
    if action!='cleanup': subprocess.run(['scp','waw2:/tmp/eserv-sftp-acceptance.json',str(handoff)],check=True)
def denied(password):
    try: t,_=connect(password)
    except paramiko.AuthenticationException: return
    t.close();raise AssertionError('Revoked password accepted')
def disconnected(client):
    for _ in range(30):
        try: client.stat('readme.txt')
        except Exception: return
        time.sleep(.1)
    raise AssertionError('Existing session was not disconnected')

try:
    transport,client=connect(data['password'])
    assert client.open('readme.txt').read()==b'SFTP acceptance'
    with client.open('upload.txt','w') as f: f.write('write check')
    client.rename('upload.txt','renamed.txt');assert client.open('renamed.txt').read()==b'write check';client.remove('renamed.txt')
    for target in ['escape','../outside.txt','/etc/passwd','/servers/8/data/serverfiles/server.cfg']:
        try: client.open(target).read()
        except OSError: continue
        raise AssertionError('Escaped SFTP home through '+target)
    try: client.symlink('../outside.txt','new-link')
    except OSError: pass
    else: raise AssertionError('Symlink creation unexpectedly allowed')
    channel=transport.open_session()
    try:
        channel.exec_command('id');result=channel.recv(128)
        assert not result, 'SSH command execution allowed'
    except paramiko.SSHException: pass
    print('PASS: public game-IP login, pinned host key, read/write/rename/delete, traversal and symlink isolation, no shell')
    old=data['password'];remote('rotate');data=json.loads(handoff.read_text());disconnected(client);denied(old)
    transport.close();transport,client=connect(data['password']);print('PASS: password rotation disconnects active session and rejects the old password')
    remote('disable');disconnected(client);denied(data['password']);transport.close()
    print('PASS: disabling SFTP disconnects sessions and rejects login')
    try: s=socket.create_connection(('51.68.155.190',data['port']),timeout=3)
    except OSError: print('PASS: SFTP port unavailable on node management IP')
    else: s.close();raise AssertionError('SFTP is listening on node management IP')
finally:
    remote('cleanup');handoff.unlink(missing_ok=True)
