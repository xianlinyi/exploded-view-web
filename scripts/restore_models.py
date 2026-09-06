#!/usr/bin/env python3
"""Restore pinned public Human Atlas models; validate Git blobs and decoded sizes."""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
import time
import urllib.request

def valid(data, record):
    header = f'blob {len(data)}\0'.encode()
    return len(data) == record['bytes'] and hashlib.sha1(header + data).hexdigest() == record['gitBlob']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    args = parser.parse_args()
    project = args.project.expanduser().resolve()
    lock = json.loads((Path(__file__).resolve().parents[1] / 'assets/upstream-lock.json').read_text())
    manifest = project / 'public/models/atlas.json'
    if not manifest.is_file():
        parser.error('Missing public/models/atlas.json; first create --mode human-atlas.')
    manifest_record = next(r for r in lock['sourceFiles'] if r['path'] == 'public/models/atlas.json')
    manifest_bytes = manifest.read_bytes()
    if hashlib.sha1(f'blob {len(manifest_bytes)}\0'.encode() + manifest_bytes).hexdigest() != manifest_record['gitBlob']:
        parser.error('atlas.json differs from pinned snapshot; use a fresh human-atlas project.')
    records = {r['path']: r for r in lock['modelFiles']}
    # Fail before any download if an existing target differs. Do not silently overwrite user models.
    for name, record in records.items():
        path = project / name
        if path.exists() and not valid(path.read_bytes(), record):
            parser.error(f'Existing model differs from pinned snapshot: {name}; use a fresh project.')
    def restore(record):
        name = record['path']
        path = project / name
        if path.exists():
            compressed = path.read_bytes()
        else:
            url = f"https://raw.githubusercontent.com/ashemag/human-atlas/{lock['commit']}/{name}"
            for attempt in range(3):
                try:
                    if shutil.which('curl'):
                        # Use the OS trust store when available, never disable TLS verification.
                        compressed = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '90', url])
                    else:
                        with urllib.request.urlopen(url, timeout=60) as response:
                            compressed = response.read()
                    if not valid(compressed, record):
                        raise ValueError(f'Blob checksum mismatch: {name}')
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(attempt + 1)
        raw = gzip.decompress(compressed)
        raw_name = name.removesuffix('.gz')
        if not valid(raw, records[raw_name]):
            raise ValueError(f'Decoded checksum mismatch: {raw_name}')
        for out, data in [(path, compressed), (project / raw_name, raw)]:
            if not out.exists():
                temporary = out.with_name(out.name + '.download')
                temporary.write_bytes(data)
                temporary.replace(out)
        return name
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for name in pool.map(restore, [r for r in records.values() if r['path'].endswith('.gz')]):
            print(f'Verified {name}', flush=True)
    print(f"Restored 15 chunks, compressed and raw. Commit: {lock['commit']}")

if __name__ == '__main__':
    main()
