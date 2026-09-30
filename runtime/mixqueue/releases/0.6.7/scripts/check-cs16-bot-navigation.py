#!/usr/bin/env python3
"""Read-only ESERV preflight: pair installed BSPs with native zBot NAV v4/v5.

Run on an empty, unleased game host before enabling AI tests. This does not
generate navigation, edit configuration, start a game or certify playability.
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def inspect(root, name):
    result = {'map': name, 'ready': False}
    bsp, nav = root / 'maps' / (name + '.bsp'), root / 'maps' / (name + '.nav')
    if not bsp.is_file():
        return {**result, 'error': 'missing_map'}
    with bsp.open('rb') as stream:
        if stream.read(4) != struct.pack('<I', 30):
            return {**result, 'error': 'invalid_bsp_header'}
    result.update(bsp_bytes=bsp.stat().st_size, bsp_sha256=digest(bsp))
    if not nav.is_file():
        return {**result, 'error': 'test_bot_nav_missing'}
    with nav.open('rb') as stream:
        header = stream.read(12)
    if len(header) != 12:
        return {**result, 'error': 'test_bot_nav_invalid'}
    magic, version, bsp_bytes = struct.unpack('<III', header)
    result.update(nav_version=version, nav_bytes=nav.stat().st_size, nav_sha256=digest(nav))
    if magic != 0xFEEDFACE or version not in (4, 5) or bsp_bytes != result['bsp_bytes'] or nav.stat().st_size <= 16:
        return {**result, 'error': 'test_bot_nav_invalid'}
    return {**result, 'ready': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True, help='Existing cstrike directory')
    parser.add_argument('maps', nargs='+', help='The exact installed test map pool')
    args = parser.parse_args()
    if not args.root.is_dir() or any(not re.fullmatch(r'de_[a-z0-9_]{1,35}', name) for name in args.maps):
        parser.error('Use an existing cstrike root and valid de_ map names')
    profiles = {name: args.root.joinpath(name).is_file() for name in ('BotProfile.db', 'BotChatter.db')}
    result = {'schema_version': 1, 'profiles_present': profiles,
              'maps': [inspect(args.root, name) for name in dict.fromkeys(args.maps)],
              'scope': 'Header and SHA-256 pairing only; verify controller preflight and actual AI gameplay separately.'}
    result['ready'] = all(profiles.values()) and all(row['ready'] for row in result['maps'])
    print(json.dumps(result, indent=2))
    return 0 if result['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
