"""Independent bounded reader for tree-classification-dataset:1.0.0 folders.

Blocks are storage units within sensor observations, never independent trees.
Only XYZ is a default model input. Tree reference is scalar and valid by rank.
"""
import argparse
import hashlib
import json
from pathlib import Path

import laspy
import numpy as np
import jsonschema

from classification.audit import hash_file
from classification.model import TASK, safe_path, validate_vocabulary


class TreeDataset:
    def __init__(self, root):
        self.root=Path(root).resolve()
        self.manifest=json.loads(self.file('dataset.json').read_text())
        schema=Path(__file__).resolve().parents[2]/'tree-classification-dataset.schema.json'
        jsonschema.Draft202012Validator(json.loads(schema.read_text())).validate(self.manifest)
        if self.manifest.get('schema')!='tree-classification-dataset:1.0.0' or self.manifest.get('task_ref')!=TASK:
            raise ValueError('UNSUPPORTED_CLASSIFICATION_PACKAGE')
        self.vocabulary=json.loads(self.file('vocabulary.json').read_text())
        self.taxa,self.mappings=validate_vocabulary(self.vocabulary)
        self.trees={(t['source_ref'],t['tree_id']):t for t in self.manifest['trees']}
        if len(self.trees)!=len(self.manifest['trees']):
            raise ValueError('DUPLICATE_TREE_ID')

    def file(self, name):
        safe_path(name)
        path=self.root/name
        if not path.resolve().is_relative_to(self.root) or any(p.is_symlink() for p in [path,*path.parents] if p!=self.root):
            raise ValueError('PACKAGE_PATH_ESCAPE')
        return path

    def iter_observation(self, observation):
        tree=self.trees[observation['source_ref'],observation['tree_id']]
        offset=0
        for chunk in observation['blocks']:
            if chunk['offset']!=offset or not 0<chunk['points']<=250000:
                raise ValueError('BLOCK_COVERAGE_MISMATCH')
            raw=self.file(chunk['records_path']).read_bytes()
            xyz=self.file(chunk['xyz_path']).read_bytes()
            if (len(raw)!=chunk['points']*observation['point_record_length'] or len(xyz)!=chunk['points']*24 or
                hashlib.sha256(raw).hexdigest()!=chunk['records_sha256'] or hashlib.sha256(xyz).hexdigest()!=chunk['xyz_sha256']):
                raise ValueError('BLOCK_CHECKSUM_MISMATCH')
            coords=np.frombuffer(xyz,dtype='<f8').reshape(-1,3)
            if not np.isfinite(coords).all():
                raise ValueError('INVALID_XYZ')
            yield dict(source_ref=observation['source_ref'],tree_id=observation['tree_id'],
                       observation_id=observation['observation_id'],modality=observation['modality'],
                       published_split=tree['published_split'],row_offset=offset,xyz=coords,
                       native_records=raw,taxonomy=tree['taxonomy'],reference_valid=tree['reference_valid'])
            offset+=chunk['points']
        if offset!=observation['points']:
            raise ValueError('OBSERVATION_COVERAGE_MISMATCH')

    def validate(self):
        from classification.canonical import fingerprint
        plan=json.loads(self.file('dataset-plan.json').read_text())
        schema=Path(__file__).resolve().parents[2]/'tree-classification-plan.schema.json'
        jsonschema.Draft202012Validator(json.loads(schema.read_text())).validate(plan)
        if plan.get('schema_version')!='3.0.0' or plan.get('task_ref')!=TASK:
            raise ValueError('PLAN_TASK_MISMATCH')
        unhashed={k:v for k,v in plan.items() if k!='plan_sha256'}
        if fingerprint(unhashed)!=plan['plan_sha256'] or self.manifest['plan_sha256']!=plan['plan_sha256']:
            raise ValueError('PLAN_CHECKSUM_MISMATCH')
        if self.vocabulary!=plan['vocabulary'] or fingerprint(self.vocabulary)!=plan['vocabulary_sha256']:
            raise ValueError('VOCABULARY_CHANGED')
        if self.manifest['trees']!=plan['trees'] or self.manifest['rights']!=plan['rights']:
            raise ValueError('PACKAGE_PROVENANCE_MISMATCH')
        expected={(o['source_ref'],o['observation_id']):o for o in plan['observations']}
        seen=set(); points=0; chunks=0
        for observation in self.manifest['observations']:
            key=(observation['source_ref'],observation['observation_id'])
            if key in seen or key not in expected:
                raise ValueError('DUPLICATE_OR_UNPLANNED_OBSERVATION')
            seen.add(key)
            if any(observation.get(k)!=v for k,v in expected[key].items()):
                raise ValueError('ALTERED_OBSERVATION_MEMBERSHIP')
            tree=self.trees[observation['source_ref'],observation['tree_id']]
            mapping=self.mappings.get((tree['source_ref'],tree['native_label']))
            for rank in self.vocabulary['ranks']:
                ref=mapping[rank] if mapping else None
                if tree['taxonomy'][rank]!=ref or tree['reference_valid'][rank] is not (ref is not None):
                    raise ValueError('ALTERED_TREE_TAXONOMY')
            native=self.file(observation['original_path'])
            if native.stat().st_size!=observation['size_bytes'] or hash_file(native)!=observation['sha256']:
                raise ValueError('ORIGINAL_CHECKSUM_MISMATCH')
            records_hash=hashlib.sha256()
            with laspy.open(native) as reader:
                for block in self.iter_observation(observation):
                    count=len(block['xyz']); source=reader.read_points(count)
                    xyz=np.column_stack([source.x,source.y,source.z])
                    if source.array.tobytes()!=block['native_records'] or not np.array_equal(xyz,block['xyz']):
                        raise ValueError('NATIVE_EQUIVALENCE_FAILED')
                    records_hash.update(block['native_records']); points+=count; chunks+=1
                if len(reader.read_points(1)):
                    raise ValueError('DROPPED_NATIVE_POINTS')
            if records_hash.hexdigest()!=observation['native_records_sha256']:
                raise ValueError('NATIVE_REFERENCE_CHANGED')
        if seen!=set(expected) or points!=plan['totals']['points']:
            raise ValueError('PLANNED_SOURCE_OR_OBSERVATION_MISSING')
        traversed={(a['source_ref'],a['archive']):a for a in self.manifest['archive_verification']}
        for archive in plan['archives']:
            if archive['traversal']=='sequential-complete':
                report=traversed.get((archive['source_ref'],archive['name']))
                if not report or not report.get('provider_checksum_verified') or not report.get('tar_complete') or report.get('size_bytes')!=archive['size_bytes'] or report.get('traversals')!=1:
                    raise ValueError('ARCHIVE_VERIFICATION_INCOMPLETE')
        return dict(status='validated',task_ref=TASK,trees=len(self.trees),observations=len(seen),points=points,blocks=chunks,
                    scope='Complete exported selection against original LAS/LAZ; no whole-source admission')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    args=parser.parse_args()
    print(json.dumps(TreeDataset(args.root).validate(),indent=2))


if __name__=='__main__':
    main()
