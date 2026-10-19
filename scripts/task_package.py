"""Validate and stream prepared tree-instance scenes without importing their producer."""
import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path, PurePosixPath

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
import numpy as np

REPO = Path(__file__).resolve().parents[1]
SCHEMA = REPO / 'task-package.schema.json'
PROFILE = REPO / 'scripts/for_instance'
FIELDS = {'xyz', 'instance', 'instance_valid', 'native_class', 'original_points'}


def sha_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b''):
            digest.update(block)
    return digest.hexdigest()


def decode_json(content):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key: ' + key)
            result[key] = value
        return result

    def invalid(value):
        raise ValueError('Nonfinite JSON constant: ' + value)

    return json.loads(content, object_pairs_hook=unique, parse_constant=invalid)


def read_json(path):
    return decode_json(path.read_bytes())


def inside(root, name):
    relative = PurePosixPath(name)
    if not name or relative.is_absolute() or '\\' in name or any(p in {'.', '..', ''} for p in name.split('/')):
        raise ValueError('Unsafe package path: ' + name)
    path = root.joinpath(*relative.parts)
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('Package path escapes its root: ' + name)
    return path


@dataclass(frozen=True)
class SceneChunk:
    """A storage block, not a spatial tile or an independent training example."""
    scene_id: str
    published_split: str
    row_offset: int
    xyz: np.ndarray
    instance: np.ndarray
    instance_valid: np.ndarray
    native_class: np.ndarray
    original_points: np.ndarray


class TaskPackage:
    """Read the reviewed FOR-instance 1.0 profile; unknown profiles fail closed.

    Metadata and trusted local profile pins are checked at construction. Every
    yielded chunk is verified; whole-scene counters are checked on exhaustion.
    Complete validation requires validate(), not merely opening the manifest.
    """

    def __init__(self, root, *, profile=PROFILE, schema=SCHEMA, allow_selection=False):
        self.root = Path(root).resolve()
        self.manifest_path = self.root / 'task-package.json'
        content = self.manifest_path.read_bytes()
        self.manifest_sha256 = hashlib.sha256(content).hexdigest()
        self.manifest = decode_json(content)
        self.schema_path = Path(schema)
        Draft202012Validator(read_json(self.schema_path)).validate(self.manifest)
        self.profile = Path(profile).resolve()
        pins = read_json(self.profile / 'package-lock.json')['files']
        if not {'prepare.py', 'source-lock.json', 'policy.json', 'requirements.txt'} <= set(pins):
            raise ValueError('Incomplete trusted producer profile')
        for name, expected in pins.items():
            if sha_file(inside(self.profile, name)) != expected:
                raise ValueError('Trusted producer profile changed: ' + name)
        fingerprint = hashlib.sha256(json.dumps(pins, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        if self.manifest['package_sha256'] != fingerprint:
            raise ValueError('Producer package fingerprint mismatch')
        lock = read_json(self.profile / 'source-lock.json')
        if self.manifest['source'] != dict(record_id=8287792, archive_sha256=lock['download_sha256'], provider_checksum=lock['provider_checksum']):
            raise ValueError('Source release differs from the reviewed profile')
        if self.manifest['policy'] != read_json(self.profile / 'policy.json'):
            raise ValueError('Reference policy differs from the reviewed profile')
        if self.manifest['unmatched_split_rows'] != lock['unmatched_split_rows']:
            raise ValueError('Unmatched published partitions changed')
        expected = {p['path']: p for p in lock['plots']}
        selection = self.manifest.get('selection')
        if selection:
            if not allow_selection:
                raise ValueError('Explicit selection requires allow_selection=True; this is not the complete release')
            if selection['available_plots'] != len(expected) or not set(selection['paths']) <= set(expected):
                raise ValueError('Selection differs from the reviewed source')
            expected = {name: expected[name] for name in selection['paths']}
        scenes = self.manifest['scenes']
        if len(scenes) != len(expected) or {s['path'] for s in scenes} != set(expected):
            raise ValueError('Scene membership differs from the reviewed source')
        self.scenes = {}
        paths = set()
        used_schemas = set()
        for scene in scenes:
            original = expected[scene['path']]
            for key in ['sha256', 'points', 'published_split', 'scales', 'offsets', 'crs', 'class_counts']:
                if scene[key] != original[key]:
                    raise ValueError('Scene provenance differs: ' + key)
            wanted_id = '8287792-' + hashlib.sha256(scene['path'].encode()).hexdigest()[:20]
            if scene['id'] != wanted_id or scene['id'] in self.scenes:
                raise ValueError('Invalid or duplicate scene identity')
            if not np.isfinite(scene['scales'] + scene['offsets']).all():
                raise ValueError('Nonfinite coordinate metadata')
            native = self.manifest['native_schemas'].get(scene['native_schema_ref'])
            if native is None or hashlib.sha256(json.dumps(native, sort_keys=True).encode()).hexdigest()[:20] != scene['native_schema_ref']:
                raise ValueError('Native schema fingerprint mismatch')
            used_schemas.add(scene['native_schema_ref'])
            names = [d['name'] for d in native['dimensions']]
            if len(names) != len(set(names)):
                raise ValueError('Duplicate native dimension')
            last = scene['input_snapshot_attempts'][-1]
            if last != dict(size_bytes=original['size_bytes'], stream_sha256=original['sha256'], snapshot_sha256=original['sha256']):
                raise ValueError('Final input snapshot did not verify')
            offset = 0
            for chunk in scene['chunks']:
                resolved = inside(self.root, chunk['path']).resolve()
                if resolved in paths or chunk['offset'] != offset:
                    raise ValueError('Duplicate chunk or discontinuous row offsets')
                paths.add(resolved)
                offset += chunk['points']
            if offset != scene['points'] or sum(scene['class_counts']) != offset:
                raise ValueError('Scene point totals disagree')
            if sum(scene[k] for k in ['unknown_points', 'background_points', 'tree_points']) != offset:
                raise ValueError('Reference point totals disagree')
            self.scenes[scene['id']] = scene
        if used_schemas != set(self.manifest['native_schemas']):
            raise ValueError('Unused native schema')

    def _read_chunk(self, scene, chunk):
        path = inside(self.root, chunk['path'])
        if sha_file(path) != chunk['sha256']:
            raise ValueError('Chunk checksum mismatch: ' + chunk['path'])
        with np.load(path, allow_pickle=False) as stored:
            if set(stored.files) != FIELDS or len(stored.files) != len(FIELDS):
                raise ValueError('Unexpected chunk arrays')
            arrays = {name: stored[name] for name in FIELDS}
        n = chunk['points']
        for name, dtype, shape in [('xyz', 'float64', (n, 3)), ('instance', 'int64', (n,)),
                                   ('instance_valid', 'bool', (n,)), ('native_class', 'uint8', (n,))]:
            if arrays[name].dtype != np.dtype(dtype) or arrays[name].shape != shape:
                raise ValueError('Invalid array dtype or shape: ' + name)
        raw = arrays['original_points']
        native = self.manifest['native_schemas'][scene['native_schema_ref']]
        if raw.shape != (n,) or raw.dtype.hasobject or json.loads(json.dumps(raw.dtype.descr)) != native['stored_dtype']:
            raise ValueError('Original records differ from their native schema')
        names = raw.dtype.names or ()
        class_name = 'raw_classification' if native['point_format'] < 6 else 'classification'
        if not {'X', 'Y', 'Z', 'treeID', class_name} <= set(names):
            raise ValueError('Required native dimensions missing')
        classes = raw[class_name] & 31 if class_name == 'raw_classification' else raw[class_name]
        tree_ids = raw['treeID']
        if classes.shape != (n,) or tree_ids.shape != (n,) or tree_ids.dtype.kind not in 'iuf':
            raise ValueError('Invalid native reference arrays')
        if not np.isin(classes, range(7)).all():
            raise ValueError('Unknown native class')
        if tree_ids.dtype.kind == 'f':
            valid_ids = (np.isfinite(tree_ids) & (tree_ids == np.floor(tree_ids)) & (tree_ids >= -(2**63)) & (tree_ids < 2**63)).all()
        else:
            valid_ids = not n or (int(tree_ids.min()) >= -(2**63) and int(tree_ids.max()) < 2**63)
        if not valid_ids:
            raise ValueError('Native tree identities must be integral int64 values')
        tree_class = (classes >= 4) & (classes <= 6)
        if ((tree_ids > 0) & ~tree_class).any():
            raise ValueError('Native class and positive identity conflict')
        expected = np.where(classes == 2, 0, -1).astype(np.int64)
        annotated = tree_class & (tree_ids > 0)
        expected[annotated] = tree_ids[annotated].astype(np.int64)
        xyz = np.column_stack([raw[axis] * scene['scales'][i] + scene['offsets'][i] for i, axis in enumerate(['X', 'Y', 'Z'])])
        if not np.isfinite(xyz).all() or not np.array_equal(arrays['xyz'], xyz):
            raise ValueError('XYZ does not match decoded native coordinates')
        for name, values in [('native_class', classes), ('instance', expected), ('instance_valid', expected >= 0)]:
            if not np.array_equal(arrays[name], values):
                raise ValueError('Reference differs from native policy: ' + name)
        for values in arrays.values():
            values.flags.writeable = False
        return SceneChunk(scene['id'], scene['published_split'], chunk['offset'], **arrays)

    def iter_scene(self, scene_id):
        """Yield verified, read-only storage blocks in original row order."""
        scene = self.scenes[scene_id]
        classes = np.zeros(7, dtype=np.int64)
        counts = np.zeros(3, dtype=np.int64)
        for chunk in scene['chunks']:
            result = self._read_chunk(scene, chunk)
            classes += np.bincount(result.native_class, minlength=7)
            counts += [np.count_nonzero(result.instance < 0), np.count_nonzero(result.instance == 0), np.count_nonzero(result.instance > 0)]
            yield result
        if classes.tolist() != scene['class_counts'] or counts.tolist() != [scene[k] for k in ['unknown_points', 'background_points', 'tree_points']]:
            raise ValueError('Whole-scene class or reference counts disagree')

    def validate(self):
        """Read every declared array; a metadata-only check cannot produce this report."""
        points = chunks = 0
        for scene_id in self.scenes:
            for chunk in self.iter_scene(scene_id):
                points += len(chunk.instance)
                chunks += 1
        if sha_file(self.manifest_path) != self.manifest_sha256:
            raise ValueError('Manifest changed during validation')
        return dict(status='validated', scope='All prepared chunks; not a new raw-source audit or annotation certification',
                    coverage='explicit-selection' if self.manifest.get('selection') else 'complete-release',
                    pipeline=self.manifest['pipeline'], plots=len(self.scenes), points=points, chunks=chunks,
                    manifest_sha256=self.manifest_sha256, schema_sha256=sha_file(self.schema_path),
                    validator_sha256=sha_file(Path(__file__)), package_sha256=self.manifest['package_sha256'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['validate', 'sample'])
    parser.add_argument('root', type=Path)
    parser.add_argument('--allow-selection', action='store_true', help='Accept an explicitly declared plot selection, never the full release')
    parser.add_argument('--scene', help='Scene identity for sample; never limits complete validation')
    args = parser.parse_args()
    if args.operation == 'validate' and args.scene:
        parser.error('--scene is only available for sample')
    try:
        package = TaskPackage(args.root, allow_selection=args.allow_selection)
        if args.operation == 'validate':
            result = package.validate()
        else:
            scene_id = args.scene or next(iter(package.scenes))
            chunk = next(package.iter_scene(scene_id))
            result = dict(scope='One verified storage chunk, not complete package validation', scene_id=scene_id,
                          published_split=chunk.published_split, row_offset=chunk.row_offset, points=len(chunk.instance),
                          xyz_dtype=str(chunk.xyz.dtype), instance_dtype=str(chunk.instance.dtype),
                          valid_reference_points=int(chunk.instance_valid.sum()),
                          first_instance_ids=chunk.instance[:8].tolist())
        print(json.dumps(result, indent=2, allow_nan=False))
    except ValidationError as error:
        parser.exit(1, f'Package rejected at {error.json_path}: {error.message}\n')
    except (ValueError, KeyError, OSError, StopIteration) as error:
        parser.exit(1, f'Package rejected: {error}\n')


if __name__ == '__main__':
    main()
