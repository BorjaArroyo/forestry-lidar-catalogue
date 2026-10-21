"""Offline guards for publication fingerprints and manual browser acceptance inputs."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


publication = module('publication_check', ROOT / 'scripts/check_publication.py')
acceptance = module('browser_acceptance_validator', ROOT / 'tests/browser_acceptance/validate_download.py')


class PublicationToolsTests(unittest.TestCase):
    def test_refresh_is_explicit_and_preserves_external_pins(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / 'browser-prepare').mkdir()
            (root / 'asset.js').write_text('export const version = 1;\n')
            remote = dict(url='https://example.com/frozen.wasm', sha256='a' * 64, size_bytes=42)
            runtime = {'files': {'asset':dict(url='asset.js',sha256='stale',size_bytes=0), 'external':remote}}
            (root / 'browser-prepare/runtime-lock.json').write_text(json.dumps(runtime))
            (root / 'publication-manifest.json').write_text(json.dumps({'files':{'asset.js':'stale','browser-prepare/runtime-lock.json':'stale'}}))
            with self.assertRaisesRegex(ValueError, 'Stale fingerprints'):
                publication.check(root)
            publication.check(root, write=True)
            self.assertEqual(publication.check(root), 0)
            self.assertEqual(json.loads((root / 'browser-prepare/runtime-lock.json').read_text())['files']['external'], remote)

    def test_browser_fixture_matches_reviewed_membership_and_native_evidence(self):
        fixture = json.loads((ROOT / 'tests/browser_acceptance/selection.json').read_text())
        reference = json.loads((ROOT / fixture['reference_evidence']).read_text())['browser_run']
        selected = set()
        points = 0
        for subset in fixture['subsets']:
            package = 'for_instance' if subset['record_id'] == '8287792' else 'fgi_emit'
            plots = {p['path']:p for p in json.loads((ROOT / f'scripts/{package}/source-lock.json').read_text())['plots']}
            for path in subset['paths']:
                selected.add((subset['record_id'], path))
                points += plots[path]['points']
        actual = {(source['task_plan']['source_ref'][7:], scene['path'])
                  for source in reference['sources'] for scene in source['prepared_scenes']}
        self.assertEqual(selected, actual)
        self.assertEqual(points, fixture['expected_points'])
        self.assertEqual(sum(len(scene['chunks']) for source in reference['sources'] for scene in source['prepared_scenes']), fixture['expected_blocks'])

    def test_download_validator_rejects_unsafe_and_duplicate_members_before_extraction(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            for index, members in enumerate([['../escape.npz'], ['same.json','same.json']]):
                archive = root / f'{index}.zip'
                with zipfile.ZipFile(archive, 'w') as zipped, warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    for name in members:
                        zipped.writestr(name, '{}')
                with self.assertRaises(ValueError):
                    acceptance.validate(archive, reference=ROOT / 'evidence/combined-browser-expanded-validation.json', scratch_parent=root)
            self.assertFalse((root / 'escape.npz').exists())


if __name__ == '__main__':
    unittest.main()
