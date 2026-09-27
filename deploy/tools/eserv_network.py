#!/usr/bin/env python3
"""Root-owned, Unix-socket-only manager for additional macvlan IPv4s.

The boot command uses only the local configuration, never the panel or Docker.
"""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import struct
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import UnixStreamServer


class Rejected(Exception):
    def __init__(self, message, status=409): super().__init__(message); self.status = status


def run(*args):
    try: return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=12).strip()
    except (subprocess.SubprocessError, OSError): raise Rejected('Host network inspection or operation failed. Refresh status before retrying.', 503)


def atomic(path, value):
    tmp = path.with_suffix('.tmp')
    with tmp.open('w') as out:
        os.chmod(tmp, 0o600); json.dump(value, out, indent=2); out.write('\n'); out.flush(); os.fsync(out.fileno())
    tmp.replace(path)
    fd = os.open(path.parent, os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


class Manager:
    def __init__(self, directory): self.directory = Path(directory); self.file = self.directory / 'network.json'
    def read(self): return json.loads(self.file.read_text())
    def inventory(self):
        # -4 omits interfaces without an address, including newly created links.
        items = json.loads(run('ip', '-j', '-d', 'address', 'show'))
        for item in items:
            item['other_addresses'] = [a for a in item.get('addr_info', []) if a.get('family') != 'inet' and a.get('scope') != 'link']
            item['addr_info'] = [a for a in item.get('addr_info', []) if a.get('family') == 'inet']
        return items
    @staticmethod
    def tag(entry): return 'eserv-managed-ip:' + entry['ip']
    def validate(self, entries, config):
        if not isinstance(entries, list) or len(entries) > 64: raise Rejected('Expected at most 64 additional IPs.', 400)
        result = []; seen = [set(), set(), set()]
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {'name', 'parent', 'ip', 'mac'} or not all(isinstance(v, str) for v in entry.values()): raise Rejected('Expected interface name, parent, IPv4 and MAC only.', 400)
            e = dict(entry); e['mac'] = e['mac'].lower()
            try: valid_ip = ipaddress.IPv4Address(e['ip']).is_global
            except ValueError: valid_ip = False
            if not valid_ip or not re.fullmatch(r'(?:esip|macvlan)[0-9]{1,5}', e['name']) or e['parent'] not in config['parents'] or not re.fullmatch(r'(?:[0-9a-f]{2}:){5}[0-9a-f]{2}', e['mac']) or int(e['mac'][:2], 16) & 1 or e['mac'] == '00:00:00:00:00:00': raise Rejected('Use a public IPv4, unicast virtual MAC and an allowed parent interface.', 400)
            for idx, key in enumerate(['name', 'ip', 'mac']):
                if e[key] in seen[idx]: raise Rejected('Interface names, IPs and MACs must be unique.', 400)
                seen[idx].add(e[key])
            result.append(e)
        return sorted(result, key=lambda e: e['name'])
    def matches(self, live, entry, inventory):
        parent = next((i for i in inventory if i['ifname'] == entry['parent']), {})
        return (live.get('link') == entry['parent'] or live.get('link_index', -1) == parent.get('ifindex')) and live.get('address', '').lower() == entry['mac'] and live.get('linkinfo', {}).get('info_kind') == 'macvlan' and live.get('linkinfo', {}).get('info_data', {}).get('mode') == 'bridge'
    def preflight(self, entries, config, inventory):
        live = {i['ifname']: i for i in inventory}
        for e in entries:
            if e['parent'] not in live: raise Rejected('Parent interface is missing: ' + e['parent'])
            for interface in inventory:
                if interface['ifname'] != e['name'] and any(a.get('local') == e['ip'] for a in interface.get('addr_info', [])): raise Rejected('IP already belongs to another interface: ' + e['ip'])
            if e['name'] in live:
                item = live[e['name']]
                if not self.matches(item, e, inventory): raise Rejected('Existing interface has different MAC, parent or type: ' + e['name'])
                if item.get('ifalias') not in (None, '', self.tag(e)): raise Rejected('Interface is managed by another service: ' + e['name'])
                if item.get('other_addresses'): raise Rejected('Interface has other global addresses: ' + e['name'])
                if any(a.get('local') != e['ip'] or a.get('prefixlen') != 32 for a in item.get('addr_info', [])): raise Rejected('Existing interface has other IPv4 addresses: ' + e['name'])
    def usage(self, ip):
        # Inspect stopped containers as well: their reserved bindings must survive.
        ids = run('docker', 'ps', '-aq').split()
        containers = json.loads(run('docker', 'inspect', *ids)) if ids else []
        reasons = []
        for c in containers:
            if any(p.get('HostIp') == ip for ports in (c.get('HostConfig', {}).get('PortBindings') or {}).values() for p in (ports or [])):
                reasons.append('Container ' + c['Name'].lstrip('/'))
        for line in run('ss', '-H', '-lntu').splitlines():
            if any(token.startswith(ip + ':') for token in line.split()): reasons.append('Host service listening on this IP'); break
        return reasons
    def plan(self, body):
        config = self.read()
        if not isinstance(body, dict) or set(body) != {'revision', 'entries'}: raise Rejected('Expected revision and entries only.', 400)
        if type(body['revision']) is not int or body['revision'] != config['revision']: raise Rejected('Network settings changed. Reload before saving.')
        entries = self.validate(body['entries'], config); inventory = self.inventory()
        self.preflight(entries, config, inventory)
        old = {e['name']: e for e in config['entries']}; new = {e['name']: e for e in entries}
        for name in old.keys() & new.keys():
            if old[name] != new[name]: raise Rejected('Remove an unused interface before changing its IP, MAC or parent: ' + name)
        removed = [e for name, e in old.items() if name not in new]
        for e in removed:
            reasons = self.usage(e['ip'])
            if reasons: raise Rejected(e['ip'] + ' is in use: ' + ', '.join(reasons))
            item = next((i for i in inventory if i['ifname'] == e['name']), None)
            if item and (not self.matches(item, e, inventory) or item.get('ifalias') != self.tag(e)): raise Rejected('Refusing to remove an interface no longer owned by the panel.')
        return config, entries, inventory, {'add': [e for name, e in new.items() if name not in old], 'remove': removed, 'keep': [e for name, e in new.items() if name in old]}
    def ensure(self, entries):
        inventory = self.inventory(); self.preflight(entries, self.read(), inventory)
        for e in entries:
            item = next((i for i in inventory if i['ifname'] == e['name']), None)
            if not item: run('ip', 'link', 'add', 'link', e['parent'], 'name', e['name'], 'address', e['mac'], 'type', 'macvlan', 'mode', 'bridge')
            run('ip', 'link', 'set', 'dev', e['name'], 'alias', self.tag(e))
            if not item or not any(a.get('local') == e['ip'] and a.get('prefixlen') == 32 for a in item.get('addr_info', [])): run('ip', 'address', 'add', e['ip'] + '/32', 'dev', e['name'])
            if not item or 'UP' not in item.get('flags', []): run('ip', 'link', 'set', 'dev', e['name'], 'up')
    def remove(self, entries):
        inventory = self.inventory()
        for e in entries:
            item = next((i for i in inventory if i['ifname'] == e['name']), None)
            if item:
                if not self.matches(item, e, inventory) or item.get('ifalias') != self.tag(e): raise Rejected('Refusing to remove an unmanaged interface.')
                run('ip', 'link', 'delete', 'dev', e['name'])
    def boot(self):
        config = self.read(); entries = self.validate(config['entries'], config)
        self.ensure(entries); self.remove(config.get('retired', []))
        if config.get('retired'): config['retired'] = []; atomic(self.file, config)
    def apply(self, body):
        old, entries, inventory, changes = self.plan(body)
        next_config = {**old, 'revision': old['revision'] + 1, 'entries': entries, 'retired': changes['remove']}
        # Persist first. A power loss midway is reconciled by boot without the panel.
        atomic(self.file, next_config)
        try:
            self.ensure(entries); self.remove(changes['remove'])
            next_config['retired'] = []; atomic(self.file, next_config)
        except Exception:
            atomic(self.file, old)
            try:
                self.ensure(old['entries'])
                self.remove([e for e in changes['add'] if not any(i['ifname'] == e['name'] for i in inventory)])
            except Exception: raise Rejected('Apply and rollback need attention. Saved boot configuration was restored; inspect host network status.', 503)
            raise
        return self.snapshot()
    def snapshot(self):
        config = self.read(); inventory = self.inventory(); entries = []
        for e in config['entries']:
            item = next((i for i in inventory if i['ifname'] == e['name']), {})
            ok = bool(item) and self.matches(item, e, inventory) and 'UP' in item.get('flags', []) and any(a.get('local') == e['ip'] and a.get('prefixlen') == 32 for a in item.get('addr_info', []))
            entries.append({**e, 'status': 'active' if ok else 'needs-attention', 'persistent': True})
        discovered = []
        for i in inventory:
            parent = i.get('link') or next((p['ifname'] for p in inventory if p['ifindex'] == i.get('link_index')), '')
            if parent not in config['parents'] or i['ifname'] in [e['name'] for e in entries]: continue
            addresses = i.get('addr_info', [])
            if len(addresses) != 1 or addresses[0].get('prefixlen') != 32: continue
            e = {'name': i['ifname'], 'parent': parent, 'ip': addresses[0]['local'], 'mac': i.get('address', '')}
            try:
                self.validate([e], config)
                if self.matches(i, e, inventory): discovered.append(e)
            except Rejected: pass
        return {'available': True, 'revision': config['revision'], 'parents': config['parents'], 'entries': entries, 'discovered': discovered, 'autostart': run('systemctl', 'is-enabled', 'eserv-network-boot.service') == 'enabled'}


class Server(UnixStreamServer, HTTPServer): pass


def serve(manager, socket_path):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_GET(self): self.dispatch('GET')
        def do_POST(self): self.dispatch('POST')
        def do_PUT(self): self.dispatch('PUT')
        def dispatch(self, method):
            try:
                _, uid, _ = struct.unpack('3i', self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                if uid != 0: raise Rejected('Root peer required.', 403)
                length = int(self.headers.get('Content-Length', '0'))
                if length < 0 or length > 32768: raise Rejected('Request too large.', 413)
                body = json.loads(self.rfile.read(length)) if length else None
                with (manager.directory / 'network.lock').open('a') as lock:
                    fcntl.flock(lock, fcntl.LOCK_EX)
                    if method == 'GET' and self.path == '/network': result = manager.snapshot()
                    elif method == 'POST' and self.path == '/network/preview': result = manager.plan(body)[3]
                    elif method == 'PUT' and self.path == '/network': result = manager.apply(body)
                    else: raise Rejected('Unknown operation.', 404)
                status = 200
            except Rejected as e: status, result = e.status, {'error': str(e)}
            except (ValueError, TypeError): status, result = 400, {'error': 'Invalid request.'}
            except Exception: status, result = 503, {'error': 'Host network state unavailable. Refresh before retrying.'}
            payload = json.dumps(result).encode(); self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
    socket_path = Path(socket_path); socket_path.parent.mkdir(mode=0o700, exist_ok=True); socket_path.unlink(missing_ok=True)
    server = Server(str(socket_path), Handler); os.chmod(socket_path, 0o600); server.serve_forever()


if __name__ == '__main__':
    os.umask(0o077)
    p = argparse.ArgumentParser(); p.add_argument('action', choices=['boot', 'serve']); p.add_argument('--directory', default='/etc/eserv'); p.add_argument('--socket', default='/run/eserv-network/control.sock'); args = p.parse_args()
    manager = Manager(args.directory)
    if args.action == 'boot':
        with (manager.directory / 'network.lock').open('a') as lock: fcntl.flock(lock, fcntl.LOCK_EX); manager.boot()
    else: serve(manager, args.socket)
