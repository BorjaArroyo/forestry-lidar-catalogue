"""Reference semantics, lossless conversion and recovery on small native LAS fixtures."""
import csv
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import laspy
import numpy as np

HERE = Path(__file__).resolve().parent
TEMP = HERE.parents[1] / 'temp'
TEMP.mkdir(exist_ok=True)
SPEC = importlib.util.spec_from_file_location('for_instance_pipeline', HERE / 'prepare.py')
pipeline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pipeline)


def lock_package(package):
    names = ['prepare.py', 'source-lock.json', 'policy.json', 'requirements.txt']
    pipeline.save(package / 'package-lock.json', {'files': {n: pipeline.sha(package / n) for n in names}})


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(dir=TEMP)
        self.root = Path(self.scratch.name)
        self.source = self.root / 'source'
        self.output = self.root / 'prepared'
        self.package = self.root / 'pipeline'
        self.package.mkdir()
        for name in ['prepare.py', 'requirements.txt', 'policy.json']:
            shutil.copyfile(HERE / name, self.package / name)
        native = self.source / pipeline.PREFIX
        native.mkdir(parents=True)
        plots, files, rows = [], {}, []
        for index, dtype in enumerate(['int32', 'float64']):
            header = laspy.LasHeader(point_format=3, version='1.2')
            header.scales = np.array([.01, .02, .03])
            header.offsets = np.array([12345, 67890, 10])
            header.add_extra_dim(laspy.ExtraBytesParams(name='treeID', type=dtype))
            header.add_extra_dim(laspy.ExtraBytesParams(name='native_extra', type='float32'))
            points = laspy.LasData(header)
            points.X = np.arange(9, dtype=np.int32)
            points.Y = np.arange(9, dtype=np.int32) * -2
            points.Z = np.arange(9, dtype=np.int32) * 3
            points.classification = [0, 1, 2, 3, 4, 5, 6, 4, 5]
            points.synthetic = [1] * 9  # Packed classification flags must survive.
            points.treeID = np.array([0, 0, 0, 0, 17, 17, 18, 0, -1], dtype=dtype)
            points.native_extra = np.arange(9, dtype=np.float32) / 10
            name = f'COLLECTION/plot_{index}.las'
            path = native / name
            path.parent.mkdir(exist_ok=True)
            points.write(path)
            relative = str(pipeline.PREFIX / name)
            file = {'size_bytes': path.stat().st_size, 'sha256': pipeline.sha(path)}
            files[relative] = file
            rows.append({'path': name, 'folder': 'COLLECTION', 'split': 'test' if index else 'dev'})
            plots.append(dict(path=relative, **file, points=9, class_counts=[1,1,1,1,2,2,1],
                              published_split=rows[-1]['split'], scales=header.scales.tolist(),
                              offsets=header.offsets.tolist(), crs=None))
        self.missing = {'path': 'NIBIO2/absent.las', 'folder': 'NIBIO2', 'split': 'test'}
        rows.append(self.missing)
        split = native / 'data_split_metadata.csv'
        with split.open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=['path','folder','split'])
            writer.writeheader()
            writer.writerows(rows)
        files[str(pipeline.PREFIX / split.name)] = dict(size_bytes=split.stat().st_size, sha256=pipeline.sha(split))
        self.lock = dict(download_sha256='a'*64, provider_checksum='md5:'+'b'*32,
                         files=files, plots=plots, split_rows=rows, unmatched_split_rows=[self.missing])
        manifest = dict(record_id=8287792, status='verified', download_sha256='a'*64,
                        provider_checksum='md5:'+'b'*32, outputs=[dict(path=k,**v) for k,v in files.items()])
        path = self.source / 'sources/8287792/manifests/FORinstance_dataset.zip.json'
        path.parent.mkdir(parents=True)
        pipeline.save(path, manifest)
        pipeline.save(self.package / 'source-lock.json', self.lock)
        lock_package(self.package)

    def tearDown(self):
        self.scratch.cleanup()

    def prepare(self):
        with patch.object(pipeline, 'CHUNK_POINTS', 3):
            return pipeline.prepare(self.source, self.output, self.package)

    def test_literal_reference_policy_and_numeric_boundaries(self):
        classes = np.array([0,1,2,3,4,5,6,4,5])
        ids, valid = pipeline.reference(classes, np.array([0,0,0,0,17,17,18,0,-1]))
        np.testing.assert_array_equal(ids, [-1,-1,0,-1,17,17,18,-1,-1])
        np.testing.assert_array_equal(valid, [False,False,True,False,True,True,True,False,False])
        self.assertEqual(pipeline.reference(np.array([4]), np.array([2**63-1],dtype=np.int64))[0][0], 2**63-1)
        for invalid in [float('nan'),float('inf'),1.5,float(2**63)]:
            with self.assertRaises(ValueError):
                pipeline.reference(np.array([4]), np.array([invalid]))
        for cls, ids in [(7, 1), (1, 1), (2, 1), (3, 1)]:
            with self.assertRaises(ValueError):
                pipeline.reference(np.array([cls]), np.array([ids]))

    def test_lossless_fields_masks_splits_and_no_source_mutation(self):
        hashes = {p: pipeline.sha(self.source / p) for p in self.lock['files']}
        result = self.prepare()
        self.assertEqual(result['unmatched_split_rows'], [self.missing])
        self.assertEqual([s['published_split'] for s in result['scenes']], ['dev','test'])
        for scene in result['scenes']:
            self.assertEqual(len(scene['chunks']), 3)
            native = laspy.read(self.source / scene['path'])
            self.assertIn(scene['native_schema_ref'], result['native_schemas'])
            chunks = [np.load(self.output / c['path']) for c in scene['chunks']]
            try:
                np.testing.assert_array_equal(np.concatenate([c['instance'] for c in chunks]), [-1,-1,0,-1,17,17,18,-1,-1])
                np.testing.assert_array_equal(np.concatenate([c['original_points'] for c in chunks]), native.points.array)
                np.testing.assert_array_equal(np.concatenate([c['xyz'] for c in chunks]), np.column_stack([native.x,native.y,native.z]))
            finally:
                for chunk in chunks:
                    chunk.close()
        self.assertEqual(hashes, {p: pipeline.sha(self.source / p) for p in hashes})
        self.assertFalse((self.output / '.incomplete.json').exists())
        self.assertFalse((self.output / '.staging').exists())

    def test_interrupted_run_reuses_only_complete_verified_scenes(self):
        original = pipeline.convert_plot
        attempts = []
        def interrupt(*args, **kwargs):
            attempts.append(args[2]['path'])
            if len(attempts) == 2:
                raise RuntimeError('Interrupted fixture')
            return original(*args, **kwargs)
        with patch.object(pipeline, 'convert_plot', side_effect=interrupt):
            with self.assertRaisesRegex(RuntimeError, 'Interrupted'):
                self.prepare()
        checkpoint = pipeline.read(self.output / '.incomplete.json')
        first = checkpoint['scenes'][0]['chunks'][0]
        before = (self.output / first['path']).stat().st_mtime_ns
        result = self.prepare()
        self.assertEqual(len(result['scenes']), 2)
        self.assertEqual(before, (self.output / first['path']).stat().st_mtime_ns)
        self.assertEqual(self.prepare(), result)

    def test_corrupted_input_is_blocked_without_touching_original(self):
        path = self.source / self.lock['plots'][0]['path']
        original = path.read_bytes()
        path.write_bytes(original + b'changed')
        with self.assertRaisesRegex(ValueError, 'Input snapshot failed'):
            self.prepare()
        self.assertEqual(path.read_bytes(), original + b'changed')
        self.assertFalse((self.output / 'task-package.json').exists())

    def test_semantic_output_corruption_is_detected_even_with_updated_checksum(self):
        result = self.prepare()
        chunk = result['scenes'][0]['chunks'][0]
        path = self.output / chunk['path']
        with np.load(path) as archive:
            arrays = {k:archive[k] for k in archive.files}
        arrays['instance'][1] = 0  # Unlabeled low vegetation is not known background.
        np.savez(path, **arrays)
        chunk['sha256'] = pipeline.sha(path)
        pipeline.save(self.output / 'task-package.json', result)
        with self.assertRaisesRegex(ValueError, 'differ from the native'):
            self.prepare()

    def test_existing_destination_and_changed_package_are_blocked(self):
        self.output.mkdir()
        keep = self.output / 'keep.txt'
        keep.write_text('keep')
        with self.assertRaisesRegex(ValueError, 'not a resumable'):
            self.prepare()
        self.assertEqual(keep.read_text(), 'keep')
        (self.package / 'policy.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'package changed'):
            self.prepare()

    def test_changed_inventory_split_and_escaping_paths_are_blocked(self):
        manifest = self.source / 'sources/8287792/manifests/FORinstance_dataset.zip.json'
        changed = pipeline.read(manifest)
        changed['outputs'].append(dict(changed['outputs'][0]))
        pipeline.save(manifest, changed)
        with self.assertRaisesRegex(ValueError, 'membership differs'):
            self.prepare()
        with self.assertRaises(ValueError):
            pipeline.inside(self.source, '../outside')
        with self.assertRaises(ValueError):
            pipeline.prepare(self.source, self.source/'nested', self.package)


if __name__ == '__main__':
    unittest.main()
