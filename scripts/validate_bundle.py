#!/usr/bin/env python3
"""Validate distributable structure, document links, source snapshots, and missing files."""
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
required = ['README.md', 'SKILL.md', 'agents/openai.yaml', 'assets/upstream-lock.json',
            'assets/starter/package-lock.json', 'assets/starter/src/core.js',
            'assets/starter/src/main.js', 'assets/starter/src/import-glb.js',
            'assets/house/package-lock.json', 'assets/house/src/main.js',
            'assets/house/public/models/house.glb', 'assets/house/public/models/house.json',
            'assets/house/source/129_Walnut_Home_Overview_Night.blend',
            'assets/house/HOUSE-DATA-NOTICE.md',
            'assets/human-atlas/LICENSE', 'assets/human-atlas/public/ATTRIBUTION.md']
for name in required:
    assert (root / name).is_file(), f'Missing {name}'
text = (root / 'SKILL.md').read_text()
assert text.startswith('---\nname: exploded-view-web\n')
assert 'TODO' not in text and '[insert' not in text.lower()
for file in [root / 'SKILL.md', *sorted((root / 'references').glob('*.md'))]:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        assert (file.parent / target.split('#')[0]).exists(), f'Broken link: {file.name}: {target}'
lock = json.loads((root / 'assets/upstream-lock.json').read_text())
assert re.fullmatch('[a-f0-9]{40}', lock['commit'])
assert len(lock['modelFiles']) == 30
for record in lock['sourceFiles']:
    data = (root / 'assets/human-atlas' / record['path']).read_bytes()
    blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
    assert blob == record['gitBlob'], f"Upstream source changed: {record['path']}"
print(f"Bundle valid: {len(lock['sourceFiles'])} pinned source files, 30 model hashes, linked references and starter present.")
