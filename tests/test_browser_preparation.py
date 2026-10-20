"""Selection completeness, source rejection and native adapter equivalence."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import sys
import unittest

import numpy as np

REPO = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(REPO / 'scripts'), str(REPO / 'browser-prepare')]
from kernel import Preparation
from task_package import TaskPackage

SPEC = importlib.util.spec_from_file_location('browser_fixtures', REPO / 'scripts/for_instance/test_pipeline.py')
fixtures = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixtures)


class BrowserPreparationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PipelineTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.output = self.fixture.output.parent / 'selection'
        self.output.mkdir()
        lock = json.loads((self.fixture.package / 'source-lock.json').read_text())
        self.plot = lock['plots'][0]
        self.input = self.fixture.source / self.plot['path']

    def prepare(self):
        prep = Preparation(self.input, self.fixture.package)
        try:
            while (chunk := prep.next_block(self.output / 'chunk.npz')) is not None:
                target = self.output / chunk['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(self.output / 'chunk.npz', target)
            (self.output / 'task-package.json').write_text(json.dumps(prep.manifest))
            return prep.manifest
        finally:
            prep.reader.close()

    def open(self):
        return TaskPackage(self.output, profile=self.fixture.package, allow_selection=True)

    def test_complete_plot_has_reference_array_equivalence(self):
        manifest = self.prepare()
        with contextlib.redirect_stdout(io.StringIO()):
            full = fixtures.pipeline.prepare(self.fixture.source, self.fixture.output, self.fixture.package)
        expected = next(scene for scene in full['scenes'] if scene['path'] == self.plot['path'])
        actual = manifest['scenes'][0]
        for key in ['id', 'path', 'sha256', 'points', 'class_counts', 'unknown_points', 'background_points', 'tree_points', 'native_schema_ref']:
            self.assertEqual(actual[key], expected[key])
        for left, right in zip(actual['chunks'], expected['chunks']):
            with np.load(self.output / left['path'], allow_pickle=False) as a, np.load(self.fixture.output / right['path'], allow_pickle=False) as b:
                self.assertEqual(set(a.files), set(b.files))
                for name in a.files:
                    self.assertEqual(a[name].dtype, b[name].dtype)
                    np.testing.assert_array_equal(a[name], b[name])
        report = self.open().validate()
        self.assertEqual(report['coverage'], 'explicit-selection')
        self.assertEqual(report['plots'], 1)

    def test_selection_never_passes_the_complete_release_gate(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'complete release'):
            TaskPackage(self.output, profile=self.fixture.package)

    def test_incomplete_declared_selection_is_rejected(self):
        manifest = self.prepare()
        lock = json.loads((self.fixture.package / 'source-lock.json').read_text())
        manifest['selection']['paths'] = [p['path'] for p in lock['plots']]
        (self.output / 'task-package.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'membership'):
            self.open()

    def test_foreign_source_and_false_available_count_are_rejected(self):
        manifest = self.prepare()
        for field, value in [('paths', ['unknown.las']), ('available_plots', 999)]:
            changed = json.loads(json.dumps(manifest))
            changed['selection'][field] = value
            (self.output / 'task-package.json').write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, 'Selection differs'):
                self.open()

    def test_changed_same_size_and_truncated_sources_are_rejected(self):
        content = self.input.read_bytes()
        for changed in [content[:-1], content[:-1] + bytes([content[-1] ^ 1])]:
            self.input.write_bytes(changed)
            with self.assertRaisesRegex(ValueError, 'complete, unchanged'):
                Preparation(self.input, self.fixture.package)

    def test_selected_chunk_corruption_is_rejected(self):
        manifest = self.prepare()
        chunk = self.output / manifest['scenes'][0]['chunks'][0]['path']
        chunk.write_bytes(chunk.read_bytes() + b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.open().validate()


class BrowserBatchTests(unittest.TestCase):
    setUp = BrowserPreparationTests.setUp
    prepare = BrowserPreparationTests.prepare
    open = BrowserPreparationTests.open
    def test_selected_scenes_form_one_independently_validated_package(self):
        from batch import combine_manifests
        lock = json.loads((self.fixture.package / 'source-lock.json').read_text())
        manifests = []
        for plot in lock['plots']:
            self.input = self.fixture.source / plot['path']
            manifests.append(self.prepare())
        merged = combine_manifests(manifests)
        (self.output / 'task-package.json').write_text(json.dumps(merged))
        report = self.open().validate()
        self.assertEqual(report['plots'], len(lock['plots']))
        self.assertEqual(report['points'], sum(p['points'] for p in lock['plots']))
        with contextlib.redirect_stdout(io.StringIO()):
            native = fixtures.pipeline.prepare(self.fixture.source, self.fixture.output, self.fixture.package)
        for scene in merged['scenes']:
            expected = next(s for s in native['scenes'] if s['id'] == scene['id'])
            self.assertEqual(scene['chunks'], expected['chunks'])
            for chunk in scene['chunks']:
                self.assertEqual((self.output / chunk['path']).read_bytes(), (self.fixture.output / chunk['path']).read_bytes())
        with self.assertRaisesRegex(ValueError, 'Duplicate scene'):
            combine_manifests([manifests[0], manifests[0]])
        changed = json.loads(json.dumps(manifests[1])); changed['policy']['version'] = 'different'
        with self.assertRaisesRegex(ValueError, 'different source'):
            combine_manifests([manifests[0], changed])
        with self.assertRaises(ValueError): combine_manifests([])


class BrowserDeploymentTests(unittest.TestCase):
    def test_provider_archive_pin_agrees_with_reviewed_inventory(self):
        runtime = json.loads((REPO / 'browser-prepare/runtime-lock.json').read_text())
        inventory = json.loads((REPO / 'docs/lidar-acquisition-inventory.json').read_text())
        record = next(r for r in inventory['records'] if r['record_id'] == 8287792)
        asset = next(a for a in record['files'] if a['name'] == 'FORinstance_dataset.zip')
        self.assertEqual(runtime['provider_archive'], dict(record_id=8287792, **asset))

    def test_pinned_local_runtime_assets_match_the_actual_shipped_paths(self):
        runtime = json.loads((REPO / 'browser-prepare/runtime-lock.json').read_text())
        for entry in runtime['files'].values():
            if entry['url'].startswith('https://'):
                continue
            path = (REPO / entry['url']).resolve()
            self.assertTrue(path.is_relative_to(REPO))
            self.assertEqual(path.stat().st_size, entry['size_bytes'])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), entry['sha256'])

    def test_browser_bundle_is_included_in_the_verified_publication_manifest(self):
        publication = json.loads((REPO / 'publication-manifest.json').read_text())['files']
        for path in (REPO / 'browser-prepare').rglob('*'):
            if not path.is_file() or '__pycache__' in path.parts:
                continue
            name = path.relative_to(REPO).as_posix()
            self.assertIn(name, publication)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), publication[name])


if __name__ == '__main__':
    unittest.main()
