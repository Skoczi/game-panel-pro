#!/usr/bin/env python3
"""Run on WAW2 as root: setup/rotate/disable/cleanup isolated acceptance users.
Prints no credentials. The separate local SFTP client reads the private handoff file.
"""
import base64, json, os, pwd, secrets, shutil, sys, urllib.request, urllib.error
from pathlib import Path
import subprocess

root = Path('/srv/gamepanel-agent'); handoff = Path('/tmp/eserv-sftp-acceptance.json')
config = json.loads((root/'data/sftp-service.json').read_text())
address = json.loads(subprocess.check_output(['docker','inspect','eserv-sftp']))[0]['NetworkSettings']['Networks']['eserv-sftp-control']['IPAddress']
base = f'http://{address}:8080/api/v2'
headers = {'Authorization':'Basic '+base64.b64encode(f"{config['admin']}:{config['secret']}".encode()).decode()}
token = json.load(urllib.request.urlopen(urllib.request.Request(base+'/token',headers=headers)))['access_token']
def api(endpoint, method='GET', value=None):
    request = urllib.request.Request(base+endpoint, method=method, data=None if value is None else json.dumps(value).encode(), headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=8) as response:
        body=response.read();return json.loads(body) if body else None

def save_handoff(data):
    temp=handoff.with_suffix('.root-tmp');temp.write_text(json.dumps(data));temp.chmod(0o600);os.chown(temp,int(os.environ['SUDO_UID']),int(os.environ['SUDO_GID']));temp.replace(handoff)

action=sys.argv[1]
if action=='setup':
    assert not handoff.exists()
    name='sftp-test-'+secrets.token_hex(8); target=root/'servers'/('.sftp-acceptance-'+name)
    home=target/'home';home.mkdir(parents=True);(target/'outside.txt').write_text('private sibling');(home/'escape').symlink_to('../outside.txt');(home/'readme.txt').write_text('SFTP acceptance')
    for p in [target,home,target/'outside.txt',home/'readme.txt']: os.chown(p,1000,1000)
    password=secrets.token_urlsafe(24)
    api('/users','POST',{'username':name,'status':1,'password':password,'home_dir':'/servers/'+target.name+'/home','uid':1000,'gid':1000,'permissions':{'/':['list','download','upload','overwrite','delete_files','delete_dirs','rename','create_dirs','chtimes']},'filesystem':{'provider':0},'filters':{'denied_protocols':['FTP','DAV','HTTP']}})
    data={'username':name,'password':password,'host':'51.83.150.145','port':config['port'],'fingerprint':config['fingerprint'],'testRoot':str(target)}
    save_handoff(data)
elif action in ['rotate','disable']:
    data=json.loads(handoff.read_text());data['fingerprint']=config['fingerprint'];account=api('/users/'+data['username'])
    if action=='rotate':
        password=secrets.token_urlsafe(24);account['password']=password;data['previousPassword']=data['password'];data['password']=password
    else: account['status']=0
    api('/users/'+data['username']+'?disconnect=1','PUT',account)
    save_handoff(data)
elif action=='cleanup':
    data=json.loads(handoff.read_text());api('/users/'+data['username'],'DELETE')
    target=Path(data['testRoot']).resolve();assert target.parent==root/'servers' and target.name.startswith('.sftp-acceptance-sftp-test-')
    shutil.rmtree(target);handoff.unlink()
print('PASS:',action)
