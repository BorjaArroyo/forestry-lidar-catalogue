"""Dataset folders retain independently validated native source semantics."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import knowledge_model
from task_dataset import TaskDataset, export_dataset
import test_task_package as fixtures


class DatasetFolders(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ContractTests(); self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.model = knowledge_model.load()
        self.output = self.fixture.root.parent / 'dataset'

    def test_multiple_subsets_deduplicate_and_generate_partition_folders(self):
        report = export_dataset(self.model, [self.fixture.root, self.fixture.root], self.output,
                                use='inference', profile=self.fixture.profile)
        self.assertEqual(report['scenes'], 2); self.assertEqual(report['points'], 18)
        self.assertEqual(report['partitions'], ['dev','test'])
        self.assertTrue((self.output / 'dev/zenodo-8287792/task-package.json').is_file())
        self.assertTrue((self.output / 'test/zenodo-8287792/task-package.json').is_file())
        dataset = TaskDataset(self.output, self.model, profile=self.fixture.profile)
        with self.assertRaises(ValueError): next(dataset.iter_partition('dev'))
        dataset.validate()
        for partition in ['dev', 'test']:
            blocks = list(dataset.iter_partition(partition))
            self.assertTrue(blocks)
            self.assertTrue(all(b['published_split'] == partition for b in blocks))
            self.assertTrue(all(set(b['arrays']) == {'xyz'} for b in blocks))
        for path in self.output.rglob('*.npz'):
            original = self.fixture.root / '/'.join(path.relative_to(self.output).parts[2:])
            self.assertEqual(path.read_bytes(), original.read_bytes())

    def test_training_export_excludes_test_without_renaming_dev(self):
        report = export_dataset(self.model, [self.fixture.root], self.output, profile=self.fixture.profile)
        self.assertEqual(report['partitions'], ['dev'])
        self.assertFalse((self.output / 'test').exists()); self.assertFalse((self.output / 'train').exists())
        dataset = TaskDataset(self.output, self.model, profile=self.fixture.profile); dataset.validate()
        self.assertEqual(set(next(dataset.iter_partition('dev'))['arrays']), {'xyz','instance','instance_valid'})
        with self.assertRaises(ValueError):
            export_dataset(self.model, [self.fixture.root], self.output, profile=self.fixture.profile)

    def test_changed_contract_index_or_partition_is_rejected(self):
        export_dataset(self.model, [self.fixture.root], self.output, profile=self.fixture.profile)
        path = self.output / 'dataset.json'; original = path.read_text()
        for mutate in [lambda d:d.update(task_requirements_sha256='0'*64),
                       lambda d:d['packages'][0].update(path='../escape'),
                       lambda d:d['packages'][0].update(partition='test'),
                       lambda d:d['packages'].append(d['packages'][0])]:
            value = json.loads(original); mutate(value); path.write_text(json.dumps(value))
            with self.assertRaises(ValueError): TaskDataset(self.output, self.model, profile=self.fixture.profile)
        path.write_text(original)
        chunk = next(self.output.rglob('*.npz')); chunk.write_bytes(chunk.read_bytes()+b'changed')
        with self.assertRaises(ValueError): TaskDataset(self.output, self.model, profile=self.fixture.profile).validate()

    def test_opened_or_validated_index_cannot_change_silently(self):
        export_dataset(self.model, [self.fixture.root], self.output, profile=self.fixture.profile)
        dataset = TaskDataset(self.output, self.model, profile=self.fixture.profile)
        path = self.output / 'dataset.json'; original = path.read_bytes()
        path.write_bytes(original + b' ')
        with self.assertRaisesRegex(ValueError, 'index changed'): dataset.validate()
        path.write_bytes(original); dataset.validate(); path.write_bytes(original + b' ')
        with self.assertRaisesRegex(ValueError, 'index changed'): next(dataset.iter_partition('dev'))


if __name__ == '__main__': unittest.main()
