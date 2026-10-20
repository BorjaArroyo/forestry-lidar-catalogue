"""Lossless FGI-EMIT task adapter with conservative references and native spectral masks."""
import hashlib
import json
from pathlib import Path

import laspy
import numpy as np

PIPELINE = 'fgi-emit-plot-instances:1.0.0'
CHUNK_POINTS = 250000


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 ** 2), b''): digest.update(block)
    return digest.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def package_fingerprint(profile):
    profile = Path(profile)
    pins = read(profile / 'package-lock.json')['files']
    for name, expected in pins.items():
        if Path(name).name != name or sha(profile / name) != expected:
            raise ValueError('FGI-EMIT package integrity mismatch: ' + name)
    return hashlib.sha256(json.dumps(pins, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def reference(classes, tree_ids):
    """Class 0/5 and unidentified tree points remain unknown, never invented background."""
    classes, tree_ids = np.asarray(classes), np.asarray(tree_ids)
    if classes.shape != tree_ids.shape or not np.isin(classes, range(6)).all():
        raise ValueError('Unknown FGI-EMIT native class or reference shape')
    if tree_ids.dtype.kind not in 'iu' or (len(tree_ids) and (int(tree_ids.min()) < 0 or int(tree_ids.max()) >= 2 ** 63)):
        raise ValueError('Invalid native tree identity')
    if ((tree_ids > 0) & (classes != 1)).any():
        raise ValueError('Positive FGI-EMIT identity outside native tree class')
    instance = np.full(classes.shape, -1, dtype=np.int64)
    instance[np.isin(classes, [2, 3, 4])] = 0
    trees = (classes == 1) & (tree_ids > 0)
    instance[trees] = tree_ids[trees].astype(np.int64)
    return instance, instance >= 0


def schema(header):
    dimensions = [dict(name=d.name, dtype=str(d.dtype), bits=d.num_bits, description=d.description,
                       scales=None if d.scales is None else d.scales.tolist(),
                       offsets=None if d.offsets is None else d.offsets.tolist()) for d in header.point_format.dimensions]
    return dict(las_version=str(header.version), point_format=header.point_format.id,
                stored_dtype=json.loads(json.dumps(header.point_format.dtype().descr)), dimensions=dimensions)


class Preparation:
    """One verified complete LAS; native and browser callers share this audited kernel."""
    def __init__(self, source, profile):
        self.source, self.profile = Path(source), Path(profile)
        fingerprint = package_fingerprint(self.profile)
        lock = read(self.profile / 'source-lock.json')
        digest, size = sha(self.source), self.source.stat().st_size
        candidates = [p for p in lock['plots'] if p['sha256'] == digest and p['size_bytes'] == size]
        if len(candidates) != 1: raise ValueError('Choose one complete unchanged FGI-EMIT LAS')
        self.plot = candidates[0]
        self.reader = laspy.open(self.source)
        h = self.reader.header
        if h.are_points_compressed or h.point_format.id != 7 or str(h.version) != '1.4' or h.point_count != self.plot['points'] or h.scales.tolist() != self.plot['scales'] or h.offsets.tolist() != self.plot['offsets'] or h.parse_crs() is not None:
            self.reader.close(); raise ValueError('FGI-EMIT header differs from reviewed source')
        native = schema(h)
        key = hashlib.sha256(json.dumps(native, sort_keys=True).encode()).hexdigest()[:20]
        self.scene = {k: self.plot[k] for k in ['path','sha256','points','published_split','crs','scales','offsets']}
        self.scene.update(id='19351234-' + hashlib.sha256(self.plot['path'].encode()).hexdigest()[:20], chunks=[],
                          class_counts=[0] * 6, unknown_points=0, background_points=0, tree_points=0,
                          native_schema_ref=key, input_snapshot_attempts=[dict(size_bytes=size, stream_sha256=digest, snapshot_sha256=digest)])
        self.manifest = dict(schema_version='1.1.0', pipeline=PIPELINE, package_sha256=fingerprint,
                             source=dict(record_id=19351234, archives=lock['archives']), policy=read(self.profile / 'policy.json'),
                             scenes=[self.scene], native_schemas={key:native}, unmatched_split_rows=[],
                             selection=dict(kind='explicit-plots', paths=[self.plot['path']], available_plots=len(lock['plots']),
                                            archive_verification='Not performed by this selection; each selected LAS is SHA256 verified against the reviewed release'),
                             scope='One complete selected FGI-EMIT LAS; native reflectance values and unknown units retained',
                             geographic_independence='Not established; one Espoonlahti acquisition area')
        self.iterator = iter(self.reader.chunk_iterator(CHUNK_POINTS)); self.offset = 0

    def next_block(self, target):
        try: points = next(self.iterator)
        except StopIteration:
            self.reader.close()
            if self.offset != self.plot['points'] or self.scene['class_counts'] != self.plot['class_counts'] or sha(self.source) != self.plot['sha256']:
                raise ValueError('FGI-EMIT whole-scene integrity/count verification failed')
            return None
        xyz = np.column_stack([points.x, points.y, points.z])
        if not np.isfinite(xyz).all(): raise ValueError('Nonfinite XYZ')
        classes = np.asarray(points.classification)
        instance, valid = reference(classes, points.tree_index)
        if not np.isin(points.edge,[0,1]).all() or not np.isin(points.dead,[0,1]).all() or not np.isin(points.user_data,[1,2,3]).all():
            raise ValueError('Invalid native reference flag or scanner identity')
        features = np.column_stack([points[f'reflectance_{i}'] for i in [1,2,3]])
        if features.dtype != np.float32: raise ValueError('Native reflectance dtype changed')
        feature_valid = np.isfinite(features) & (features != -9999)
        np.savez(target, xyz=xyz, instance=instance, instance_valid=valid, native_class=classes,
                 original_points=points.array, features=features, feature_valid=feature_valid)
        chunk = dict(path=f"plots/{self.scene['id']}/{len(self.scene['chunks']):05d}.npz", points=len(points), offset=self.offset, sha256=sha(target))
        self.scene['chunks'].append(chunk)
        self.scene['class_counts'] = (np.asarray(self.scene['class_counts']) + np.bincount(classes,minlength=6)).tolist()
        for name, mask in [('unknown_points',instance < 0),('background_points',instance == 0),('tree_points',instance > 0)]:
            self.scene[name] += int(mask.sum())
        self.offset += len(points)
        return chunk


def prepare(source, output, profile=None):
    """Prepare one reviewed LAS into a new package; interrupted outputs are never resumed."""
    output = Path(output).resolve()
    if output.exists(): raise ValueError('Choose a new output directory')
    prep = Preparation(source, profile or Path(__file__).resolve().parent)
    output.mkdir(parents=True,exist_ok=False)
    marker = output / '.incomplete.json'; marker.write_text(json.dumps({'pipeline':PIPELINE}))
    try:
        while True:
            pending = output / '.pending.npz'; chunk = prep.next_block(pending)
            if chunk is None: break
            target = output / chunk['path']; target.parent.mkdir(parents=True,exist_ok=True); pending.rename(target)
        (output / 'task-package.json').write_text(json.dumps(prep.manifest,indent=2,allow_nan=False)+'\n')
        marker.unlink()
        return prep.manifest
    finally: prep.reader.close()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True,type=Path,help='One complete reviewed source LAS')
    parser.add_argument('--output',required=True,type=Path,help='New output package directory')
    args = parser.parse_args()
    result = prepare(args.input,args.output)
    print(json.dumps(dict(pipeline=result['pipeline'],plots=1,points=result['scenes'][0]['points'])))
