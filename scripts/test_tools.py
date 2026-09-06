#!/usr/bin/env python3
"""Behavioral checks for project creation and checksum helpers; no network."""
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('restore', root / 'scripts/restore_models.py')
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)

class ToolsTest(unittest.TestCase):
    def test_default_copy_uses_house_and_refuses_to_clobber(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'demo'
            command = [sys.executable, str(root / 'scripts/create_project.py'), str(target)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((target / 'src/main.js').exists())
            self.assertTrue((target / 'public/models/house.glb').exists())
            self.assertFalse((target / 'node_modules').exists())
            marker = target / 'user.txt'; marker.write_text('keep')
            again = subprocess.run(command, capture_output=True)
            self.assertNotEqual(again.returncode, 0)
            self.assertEqual(marker.read_text(), 'keep')
    def test_starter_copy_remains_available(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'starter'
            result = subprocess.run([sys.executable, str(root / 'scripts/create_project.py'), str(target), '--mode', 'starter'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((target / 'src/model.js').exists())
            self.assertFalse((target / 'public/models/house.glb').exists())
    def test_human_source_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            command = [sys.executable, str(root / 'scripts/create_project.py'), temp, '--mode', 'human-atlas']
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((Path(temp) / 'app/scene.tsx').exists())
            self.assertTrue((Path(temp) / 'public/ATTRIBUTION.md').exists())
            self.assertFalse(list(Path(temp).rglob('*.bin')))
    def test_git_checksum_detects_corruption(self):
        data = b'sample'
        record = {'bytes':len(data), 'gitBlob':hashlib.sha1(b'blob 6\0' + data).hexdigest()}
        self.assertTrue(restore.valid(data, record))
        self.assertFalse(restore.valid(b'samplf', record))
        self.assertFalse(restore.valid(b'short', record))
    def test_restore_refuses_wrong_existing_file_before_network(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp) / 'public/models'; folder.mkdir(parents=True)
            (folder / 'atlas.json').write_bytes((root / 'assets/human-atlas/public/models/atlas.json').read_bytes())
            (folder / 'body-0.bin').write_bytes(b'user-data')
            result = subprocess.run([sys.executable, str(root / 'scripts/restore_models.py'), temp], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('differs from pinned snapshot', result.stderr)
            self.assertEqual((folder / 'body-0.bin').read_bytes(), b'user-data')

if __name__ == '__main__':
    unittest.main()
