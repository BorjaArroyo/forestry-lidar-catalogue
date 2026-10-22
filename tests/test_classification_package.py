"""Independent classification reader rejection tests using native LAS fixtures."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import laspy
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'scripts'),str(ROOT/'tests')]
from classification_fixtures import build
from classification.model import resolve,PARTITIONS
from classification.package import TreeDataset
from classification.snapshot import FOR,BIODIV,write


class ClassificationPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'temp');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);fixture=build(self.root/'inputs');self.output=self.root/'output';self.output.mkdir()
        filters=[dict(source_ref=ref,collections=['synthetic-shared-plot'],modalities=['TLS','MLS','ULS','unknown'] if ref==FOR else ['TLS','ULS'],
                      partitions=PARTITIONS['inference'],taxa=[],tree_ids=[]) for ref in [FOR,BIODIV]]
        self.plan=resolve(fixture['registry'],fixture['vocabulary'],fixture['trees'],use='inference',filters=filters,
            runtime_sha256='a'*64,code_sha256='b'*64)
        observations=[]
        for index,o in enumerate(self.plan['observations']):
            prefix=f'{o["published_split"]}/{o["source_ref"].replace(":","-")}/observations/{index}'
            folder=self.output/prefix;folder.mkdir(parents=True)
            native=self.root/'inputs'/(o['tree_id']+'-'+o['modality']+'.laz');original_path=prefix+'/original.laz'
            (self.output/original_path).write_bytes(native.read_bytes())
            cloud=laspy.read(native);raw=cloud.points.array.tobytes();xyz=np.column_stack([cloud.x,cloud.y,cloud.z]).astype('<f8').tobytes()
            records_path=prefix+'/records.bin';xyz_path=prefix+'/xyz.f64'
            (self.output/records_path).write_bytes(raw);(self.output/xyz_path).write_bytes(xyz)
            block=dict(offset=0,points=o['points'],records_path=records_path,xyz_path=xyz_path,
                records_sha256=hashlib.sha256(raw).hexdigest(),xyz_sha256=hashlib.sha256(xyz).hexdigest())
            observations.append(dict(o,original_path=original_path,blocks=[block]))
        verification=[dict(source_ref=a['source_ref'],archive=a['name'],size_bytes=a['size_bytes'],provider_checksum_verified=True,
                           tar_complete=True,traversals=1) for a in self.plan['archives'] if a['traversal']=='sequential-complete']
        self.manifest=dict(schema='tree-classification-dataset:1.0.0',task_ref='task:species',plan_sha256=self.plan['plan_sha256'],
            trees=self.plan['trees'],observations=observations,rights=self.plan['rights'],spatial_audit=self.plan['spatial_audit'],
            archive_verification=verification,vocabulary='vocabulary.json',plan='dataset-plan.json',partition_policy='preserve-published')
        write(self.output/'dataset.json',self.manifest);write(self.output/'dataset-plan.json',self.plan);write(self.output/'vocabulary.json',fixture['vocabulary'])

    def test_complete_native_reader_keeps_sensor_pairing_and_partial_reference(self):
        dataset=TreeDataset(self.output);report=dataset.validate()
        self.assertEqual(report['trees'],9);self.assertEqual(report['observations'],14)
        partial=[o for o in dataset.manifest['observations'] if o['tree_id']=='B2']
        self.assertEqual({o['modality'] for o in partial},{'TLS','ULS'})
        block=next(dataset.iter_observation(partial[0]))
        self.assertEqual(block['reference_valid'],{'genus':True,'species':False})
        self.assertEqual(block['xyz'].dtype,np.float64)

    def test_changed_arrays_native_input_or_stale_vocabulary_fail(self):
        first=self.manifest['observations'][0]
        for path in [first['blocks'][0]['records_path'],first['blocks'][0]['xyz_path'],first['original_path']]:
            file=self.output/path;original=file.read_bytes();file.write_bytes(bytes([original[0]^1])+original[1:])
            try:
                with self.assertRaisesRegex(ValueError,'CHECKSUM'):TreeDataset(self.output).validate()
            finally:file.write_bytes(original)
        vocab=json.loads((self.output/'vocabulary.json').read_text());vocab['taxa'][0]['code']=999;write(self.output/'vocabulary.json',vocab)
        with self.assertRaisesRegex(ValueError,'VOCABULARY_CHANGED'):TreeDataset(self.output).validate()

    def test_missing_later_source_duplicate_observation_and_unverified_archive_fail(self):
        for mutate,reason in [
            (lambda m:m['observations'].pop(),'MISSING'),
            (lambda m:m['observations'].append(m['observations'][0]),'DUPLICATE'),
            (lambda m:m['archive_verification'].pop(),'VERIFICATION_INCOMPLETE'),
            (lambda m:m['observations'][0].update(published_split='test'),'MEMBERSHIP'),
            (lambda m:m['observations'][0]['blocks'][0].update(records_path='../outside'),'UNSAFE_PATH')]:
            modified=copy.deepcopy(self.manifest);mutate(modified);write(self.output/'dataset.json',modified)
            with self.assertRaisesRegex(ValueError,reason):TreeDataset(self.output).validate()


if __name__=='__main__':unittest.main()
