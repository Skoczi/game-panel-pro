#!/usr/bin/env python3
"""Check local file targets in repository Markdown and embedded HTML images."""
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(
    ['git', '-C', str(ROOT), 'ls-files', '-z', '--cached', '--others', '--exclude-standard']
).decode().split('\0')
missing = []
count = 0
for name in sorted(set(paths)):
    page = ROOT / name
    if page.suffix != '.md' or not page.is_file():
        continue
    text = page.read_text(encoding='utf-8')
    text = re.sub(r'```.*?```', '', text, flags=re.S)
    targets = re.findall(r'\]\(([^)]+)\)', text)
    targets += re.findall(r'<img\b[^>]*\bsrc=["\']([^"\']+)', text)
    for target in targets:
        target = target.strip().split(' "')[0].strip('<>')
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        path = unquote(parsed.path)
        resolved = ROOT / path.lstrip('/') if path.startswith('/') else page.parent / path
        count += 1
        if not resolved.exists():
            missing.append(f'{name}: {target}')
if missing:
    raise SystemExit('Missing documentation targets:\n' + '\n'.join(missing))
print(f'Checked {count} local documentation targets.')
