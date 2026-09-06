#!/usr/bin/env python3
"""Copy a complete, offline source template. Never merge into existing work."""
import argparse
from pathlib import Path
import shutil

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--mode', choices=['house', 'starter', 'human-atlas'], default='house')
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1] / 'assets' / args.mode
    target = args.destination.expanduser().resolve()
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        parser.error('Destination must be absent or an empty directory; nothing was overwritten.')
    if target == source or source in target.parents:
        parser.error('Destination cannot be inside the skill template.')
    shutil.copytree(source, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns('node_modules', 'dist', '__pycache__', '.DS_Store'))
    print(f'Created {args.mode}: {target}')
    if args.mode == 'human-atlas':
        print('Next: python3 <skill>/scripts/restore_models.py <destination>')
    print('Next: cd to destination, then npm ci, npm test, npm run build, npm run dev')

if __name__ == '__main__':
    main()
