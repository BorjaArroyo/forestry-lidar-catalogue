"""Prepare the pinned FOR-instance archive as lossless plot-instance chunks."""
import argparse
import csv
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile

from filelock import FileLock
import laspy
import numpy as np

PACKAGE = Path(__file__).resolve().parent
PIPELINE = 'for-instance-plot-instances:1.0.0'
CHUNK_POINTS = 250_000
PREFIX = Path('sources/8287792/originals/FORinstance_dataset')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b''):
            digest.update(block)
    return digest.hexdigest()


def read(path):
    return json.loads(path.read_text())


def save(path, value):
    temporary = path.with_suffix('.write-tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def inside(root, relative):
    name = PurePosixPath(relative)
    if name.is_absolute() or '..' in name.parts or '\\' in relative:
        raise ValueError('Unsafe relative path')
    path = root.joinpath(*name.parts)
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Path escapes its declared root')
    return path


def package_fingerprint(package=PACKAGE):
    lock = read(package / 'package-lock.json')['files']
    if not {'prepare.py', 'source-lock.json', 'policy.json', 'requirements.txt'} <= set(lock):
        raise ValueError('Incomplete pipeline package')
    for name, expected in lock.items():
        if sha(inside(package, name)) != expected:
            raise ValueError('Pipeline package changed: ' + name)
    encoded = json.dumps(lock, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(encoded).hexdigest()


def reference(classes, tree_ids):
    """Keep native identities; unknown reference is never converted to background."""
    classes = np.asarray(classes)
    tree_ids = np.asarray(tree_ids)
    if classes.ndim != 1 or tree_ids.shape != classes.shape or classes.dtype.kind not in 'iu':
        raise ValueError('Native classes and tree IDs must be equally sized vectors')
    if not np.isin(classes, np.arange(7)).all():
        raise ValueError('Unsupported native class')
    if tree_ids.dtype.kind == 'f':
        valid_ids = (np.isfinite(tree_ids) & (tree_ids == np.floor(tree_ids)) &
                     (tree_ids >= -(2**63)) & (tree_ids < 2**63)).all()
    elif tree_ids.dtype.kind in 'iu':
        valid_ids = not tree_ids.size or (int(tree_ids.min()) >= -(2**63) and int(tree_ids.max()) < 2**63)
    else:
        valid_ids = False
    if not valid_ids:
        raise ValueError('treeID must contain finite integral int64 values')
    tree = np.isin(classes, [4, 5, 6])
    if ((tree_ids > 0) & ~tree).any():
        raise ValueError('Positive treeID conflicts with the audited native class')
    result = np.full(len(tree_ids), -1, dtype=np.int64)
    result[classes == 2] = 0
    annotated = tree & (tree_ids > 0)
    result[annotated] = tree_ids[annotated].astype(np.int64)
    return result, result >= 0


def source_selection(root, lock):
    manifest = read(root / 'sources/8287792/manifests/FORinstance_dataset.zip.json')
    if manifest.get('status') != 'verified' or manifest.get('record_id') != 8287792:
        raise ValueError('Verified FOR-instance acquisition manifest required')
    if any(manifest.get(k) != lock[k] for k in ('download_sha256', 'provider_checksum')):
        raise ValueError('Source archive differs from the reviewed release')
    actual = {x['path']: x for x in manifest['outputs']}
    if len(actual) != len(manifest['outputs']) or set(actual) != set(lock['files']):
        raise ValueError('Acquired membership differs from the reviewed archive')
    for name, expected in lock['files'].items():
        item = actual[name]
        if any(item[k] != expected[k] for k in ('sha256', 'size_bytes')):
            raise ValueError('Acquired file differs from the reviewed source: ' + name)
    split_name = str(PREFIX / 'data_split_metadata.csv')
    split = inside(root, split_name)
    if sha(split) != lock['files'][split_name]['sha256']:
        raise ValueError('Published partition file changed')
    with split.open(newline='') as stream:
        rows = list(csv.DictReader(stream))
    if rows != lock['split_rows']:
        raise ValueError('Published partitions differ from the reviewed rows')
    for plot in lock['plots']:
        relative = str(Path(plot['path']).relative_to(PREFIX))
        matching = [r for r in rows if r['path'] == relative]
        if len(matching) != 1 or matching[0]['split'] != plot['published_split']:
            raise ValueError('Plot does not have a unique reviewed dev/test assignment')
    return lock['plots']


def schema(header):
    dimensions = []
    for dim in header.point_format.dimensions:
        dimensions.append({'name': dim.name, 'dtype': str(dim.dtype),
                           'bits': dim.num_bits, 'description': dim.description,
                           'scales': None if dim.scales is None else dim.scales.tolist(),
                           'offsets': None if dim.offsets is None else dim.offsets.tolist()})
    return {'las_version': str(header.version), 'point_format': header.point_format.id,
            'stored_dtype': json.loads(json.dumps(header.point_format.dtype().descr)), 'dimensions': dimensions}


def verify_scene(output, scene):
    points = 0
    for chunk in scene['chunks']:
        path = inside(output, chunk['path'])
        if sha(path) != chunk['sha256']:
            raise ValueError('Prepared chunk checksum failed: ' + chunk['path'])
        with np.load(path, allow_pickle=False) as data:
            if set(data.files) != {'xyz', 'instance', 'instance_valid', 'native_class', 'original_points'}:
                raise ValueError('Unexpected chunk fields')
            n = chunk['points']
            if chunk['offset'] != points or data['xyz'].shape != (n, 3):
                raise ValueError('Chunk count or row offset mismatch')
            if data['xyz'].dtype != np.float64 or data['instance'].dtype != np.int64 or data['instance_valid'].dtype != np.bool_:
                raise ValueError('Unexpected task array dtype')
            raw = data['original_points']
            if len(raw) != n or any(data[k].shape != (n,) for k in ['instance', 'instance_valid', 'native_class']):
                raise ValueError('Native/task row counts differ')
            stored_class = raw['raw_classification'] & 31 if 'raw_classification' in raw.dtype.names else raw['classification']
            xyz = np.column_stack([raw[k] * scene['scales'][i] + scene['offsets'][i] for i, k in enumerate(['X', 'Y', 'Z'])])
            ids, valid = reference(stored_class, raw['treeID'])
            for key, expected in [('xyz', xyz), ('native_class', stored_class), ('instance', ids), ('instance_valid', valid)]:
                if not np.array_equal(data[key], expected):
                    raise ValueError('Prepared values differ from the native records: ' + key)
            points += n
    if points != scene['points']:
        raise ValueError('Scene point total differs from its manifest')


def convert_plot(input_root, output, plot, chunk_points=None):
    chunk_points = CHUNK_POINTS if chunk_points is None else chunk_points
    source_path = inside(input_root, plot['path'])
    scene_id = '8287792-' + hashlib.sha256(plot['path'].encode()).hexdigest()[:20]
    scene_dir = inside(output, 'plots/' + scene_id)
    if scene_dir.exists():
        raise ValueError('Partial scene must be removed before retrying')
    scene_dir.mkdir(parents=True)
    scene = {k: plot[k] for k in ['path', 'sha256', 'points', 'published_split', 'crs']}
    scene.update(id=scene_id, scales=plot['scales'], offsets=plot['offsets'], chunks=[],
                 class_counts=[0] * 7, unknown_points=0, background_points=0, tree_points=0)
    # Convert only a verified private snapshot; the acquisition remains read-only.
    with tempfile.TemporaryDirectory(dir=output / '.staging') as scratch:
        snapshot = Path(scratch) / 'input.las'
        attempts = []
        for attempt in range(3):
            digest = hashlib.sha256()
            with source_path.open('rb') as source, snapshot.open('wb') as target:
                for block in iter(lambda: source.read(8 * 1024**2), b''):
                    digest.update(block)
                    target.write(block)
            observed = dict(size_bytes=snapshot.stat().st_size, stream_sha256=digest.hexdigest(),
                            snapshot_sha256=sha(snapshot))
            attempts.append(observed)
            if observed['size_bytes'] == plot['size_bytes'] and observed['stream_sha256'] == plot['sha256'] and observed['snapshot_sha256'] == plot['sha256']:
                break
            print('INPUT_RETRY', attempt + 1, plot['path'], json.dumps(observed), flush=True)
        else:
            raise ValueError('Input snapshot failed integrity verification: ' + plot['path'])
        scene['input_snapshot_attempts'] = attempts
        with laspy.open(snapshot) as source:
            h = source.header
            if h.point_count != plot['points'] or h.scales.tolist() != plot['scales'] or h.offsets.tolist() != plot['offsets']:
                raise ValueError('Native header differs from its reviewed contract')
            scene['native_schema'] = schema(h)
            offset = 0
            for index, points in enumerate(source.chunk_iterator(chunk_points)):
                xyz = np.column_stack([points.x, points.y, points.z])
                if not np.isfinite(xyz).all():
                    raise ValueError('Nonfinite XYZ')
                classes = np.asarray(points['classification'])
                ids, valid = reference(classes, points['treeID'])
                arrays = dict(xyz=xyz, instance=ids, instance_valid=valid,
                              native_class=classes, original_points=points.array)
                path = scene_dir / f'{index:05d}.npz'
                np.savez(path, **arrays)
                with np.load(path, allow_pickle=False) as stored:
                    if any(not np.array_equal(stored[k], v) for k, v in arrays.items()):
                        raise ValueError('Output read-back differs from the converted values')
                scene['chunks'].append(dict(path=str(path.relative_to(output)), points=len(points),
                                            offset=offset, sha256=sha(path)))
                scene['class_counts'] = (np.asarray(scene['class_counts']) + np.bincount(classes, minlength=7)).tolist()
                scene['unknown_points'] += int((ids < 0).sum())
                scene['background_points'] += int((ids == 0).sum())
                scene['tree_points'] += int((ids > 0).sum())
                offset += len(points)
            if offset != plot['points'] or scene['class_counts'] != plot['class_counts']:
                raise ValueError('Complete input point/class counts differ from the source audit')
    verify_scene(output, scene)
    return scene


def prepare(input_root, output, package=PACKAGE):
    input_root, output = input_root.resolve(), output.resolve()
    if output.is_relative_to(input_root) or input_root.is_relative_to(output):
        raise ValueError('Choose an output directory separate from the acquisition')
    fingerprint = package_fingerprint(package)
    lock = read(package / 'source-lock.json')
    plots = source_selection(input_root, lock)
    output.parent.mkdir(parents=True, exist_ok=True)
    with FileLock(str(output) + '.lock', timeout=0):
        checkpoint = output / '.incomplete.json'
        final = output / 'task-package.json'
        if final.exists():
            result = read(final)
            if result['package_sha256'] != fingerprint or result['pipeline'] != PIPELINE or result['policy'] != read(package / 'policy.json'):
                raise ValueError('Existing output belongs to a different pipeline package')
            expected = {p['path']:p for p in plots}
            actual = {s['path']:s for s in result['scenes']}
            if set(actual) != set(expected) or len(actual) != len(result['scenes']):
                raise ValueError('Prepared scene membership differs from the pinned source')
            for name, scene in actual.items():
                if any(scene[k] != expected[name][k] for k in ['sha256','points','published_split','scales','offsets','crs']):
                    raise ValueError('Prepared scene provenance differs from the pinned source')
                native = result['native_schemas'].get(scene['native_schema_ref'])
                if native is None or hashlib.sha256(json.dumps(native, sort_keys=True).encode()).hexdigest()[:20] != scene['native_schema_ref']:
                    raise ValueError('Native schema descriptor is missing or changed')
                verify_scene(output, scene)
            print('VERIFIED_COMPLETE', len(result['scenes']), flush=True)
            return result
        if output.exists() and not checkpoint.exists():
            raise ValueError('Existing destination is not a resumable pipeline output')
        output.mkdir(exist_ok=True)
        identity = {'pipeline': PIPELINE, 'package_sha256': fingerprint,
                    'input_root': str(input_root), 'chunk_points': CHUNK_POINTS}
        state = read(checkpoint) if checkpoint.exists() else dict(identity, scenes=[])
        if any(state[k] != v for k, v in identity.items()):
            raise ValueError('Resume inputs, package or configuration changed')
        save(checkpoint, state)
        inside(output, '.staging').mkdir(exist_ok=True)
        completed = {s['path']: s for s in state['scenes']}
        expected = {p['path']:p for p in plots}
        if len(completed) != len(state['scenes']) or not set(completed) <= set(expected):
            raise ValueError('Resume contains unexpected or duplicate plots')
        for name, scene in completed.items():
            if any(scene[k] != expected[name][k] for k in ['sha256','points','published_split','scales','offsets','crs']):
                raise ValueError('Resume scene provenance differs from the pinned source')
        remaining = [p for p in plots if p['path'] not in completed]
        required = sum(p['size_bytes'] + p['points'] * 34 for p in remaining) + max((p['size_bytes'] for p in remaining), default=0) + 64 * 1024**2
        if shutil.disk_usage(output).free < required:
            raise ValueError('Insufficient output space for remaining lossless chunks and input staging')
        for plot in plots:
            if plot['path'] in completed:
                verify_scene(output, completed[plot['path']])
                continue
            scene_id = '8287792-' + hashlib.sha256(plot['path'].encode()).hexdigest()[:20]
            partial = inside(output, 'plots/' + scene_id)
            if partial.exists():
                shutil.rmtree(partial)
            scene = convert_plot(input_root, output, plot)
            state['scenes'].append(scene)
            save(checkpoint, state)
            print('PREPARED', len(state['scenes']), '/', len(plots), plot['path'], flush=True)
        native_schemas = {}
        scenes = []
        for scene in state['scenes']:
            scene = dict(scene)
            native = scene.pop('native_schema')
            schema_id = hashlib.sha256(json.dumps(native, sort_keys=True).encode()).hexdigest()[:20]
            native_schemas[schema_id] = native
            scene['native_schema_ref'] = schema_id
            scenes.append(scene)
        result = dict(schema_version='1.0.0', pipeline=PIPELINE, package_sha256=fingerprint,
                      source={'record_id': 8287792, 'archive_sha256': lock['download_sha256'],
                              'provider_checksum': lock['provider_checksum']},
                      policy=read(package / 'policy.json'), scenes=scenes, native_schemas=native_schemas,
                      unmatched_split_rows=lock['unmatched_split_rows'],
                      scope=f'All {len(plots)} LAS plots in the pinned archive; {len(lock["unmatched_split_rows"])} partition-table entries remain unmatched',
                      geographic_independence='Not established; preserve dev/test without asserting new independent sites')
        save(final, result)
        checkpoint.unlink()
        shutil.rmtree(output / '.staging')
        print('COMPLETE', len(result['scenes']), sum(s['points'] for s in result['scenes']), flush=True)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True, help='Root created by the Zenodo acquisition CLI')
    parser.add_argument('--output', type=Path, required=True, help='New or matching interrupted task-package directory')
    args = parser.parse_args()
    prepare(args.input, args.output)


if __name__ == '__main__':
    main()
