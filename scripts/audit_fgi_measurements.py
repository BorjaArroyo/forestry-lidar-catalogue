"""Inspect FGI-EMIT headers and bounded point prefixes without preparing data."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import platform

import laspy
import numpy as np
import yaml

RECORD = '19351234'
METADATA_SHA256 = 'e8891b43eb0d6ca3b649a61ff79ce50a3e0bc0c6b93e14a1e5c1de09d55a482b'
METADATA_MD5 = 'a42b36c6f11e7c571b29d9006129c458'


def measurement_counts(values, sentinel):
    """Count documented absence separately from numeric finiteness."""
    values = np.asarray(values)
    missing = values == sentinel
    finite = np.isfinite(values)
    return {'sampled_points': len(values), 'sentinel_count': int(missing.sum()),
            'nonfinite_count': int((~finite).sum()),
            'valid_count': int((finite & ~missing).sum())}


def audit(root, sample_points=10_000):
    """Return scoped evidence; saved payload hashes are not reverified here."""
    if not 1 <= sample_points <= 100_000:
        raise ValueError('Sample points must be between 1 and 100000 per plot')
    source = root / 'sources' / RECORD
    metadata = (source / 'originals/metadata.yaml').read_bytes()
    if (hashlib.sha256(metadata).hexdigest() != METADATA_SHA256 or
            hashlib.md5(metadata).hexdigest() != METADATA_MD5):
        raise ValueError('FGI-EMIT metadata differs from the reviewed provider asset')
    definitions = yaml.safe_load(metadata)
    scenes = []
    schemas = {}
    expected_plots = set()
    for asset, split in [('training.zip', 'train'), ('test.zip', 'test')]:
        manifest = json.loads((source / 'manifests' / (asset + '.json')).read_text())
        if str(manifest['record_id']) != RECORD or manifest['status'] != 'verified':
            raise ValueError('A saved verified manifest is required')
        for output in manifest['outputs']:
            relative = Path(output['path'])
            path = (root / relative).resolve()
            if not path.is_relative_to((source / 'originals').resolve()) or path.suffix != '.las':
                raise ValueError('Unexpected FGI-EMIT manifest member')
            if relative.as_posix() in expected_plots or path.stat().st_size != output['size_bytes']:
                raise ValueError('Duplicate member or original size differs from saved manifest')
            expected_plots.add(relative.as_posix())
            with laspy.open(path) as reader:
                header = reader.header
                dimensions = [{'name': d.name,
                               'dtype': str(d.dtype) if d.dtype is not None else 'uint' + str(d.num_bits),
                               'description': d.description}
                              for d in header.point_format.dimensions]
                schema_key = hashlib.sha256(json.dumps(dimensions, sort_keys=True).encode()).hexdigest()
                schemas.setdefault(schema_key, {'fields': dimensions, 'plot_count': 0})['plot_count'] += 1
                points = reader.read_points(min(sample_points, header.point_count))
                with path.open('rb') as stream:
                    header_hash = hashlib.sha256(stream.read(header.offset_to_point_data)).hexdigest()
                channels = {}
                for name, definition in definitions.items():
                    if name.startswith(('reflectance_', 'amplitude_', 'intensity_', 'deviation_')):
                        channels[name] = measurement_counts(points[name], definition['missing_val'])
                crs = header.parse_crs()
                scenes.append({'path': relative.as_posix(), 'split': split,
                               'saved_payload_sha256': output['sha256'],
                               'payload_sha256_reverified': False,
                               'size_bytes': output['size_bytes'], 'header_sha256': header_hash,
                               'points': header.point_count, 'schema_sha256': schema_key,
                               'las_version': str(header.version), 'point_format': header.point_format.id,
                               'scale': header.scales.tolist(), 'offset': header.offsets.tolist(),
                               'bounds': [header.mins.tolist(), header.maxs.tolist()],
                               'crs': crs.to_string() if crs else None,
                               'sample': {'selection': 'first_points_in_stored_order',
                                          'points': len(points),
                                          'native_records_sha256': hashlib.sha256(points.array.tobytes()).hexdigest(),
                                          'origin_scanner_counts': {str(v): int(c) for v, c in zip(*np.unique(points.user_data, return_counts=True))},
                                          'measurements': channels}})
            print(f"Inspected {path.name}: header and {len(points)} prefix points", flush=True)
    if len(scenes) != 19:
        raise ValueError('Expected all 19 FGI-EMIT plot headers')
    return {'schema_version': '1.0', 'record_id': RECORD,
            'audited_at': datetime.now(timezone.utc).isoformat(),
            'inspector': {'path': 'scripts/audit_fgi_measurements.py',
                          'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
            'scope': 'All original plot headers and bounded point prefixes; not a full payload or task-preparation validation',
            'environment': {'python': platform.python_version(), 'laspy': laspy.__version__,
                            'numpy': np.__version__, 'pyyaml': yaml.__version__},
            'metadata_asset': {'name': 'metadata.yaml', 'sha256': METADATA_SHA256,
                               'provider_checksum': 'md5:' + METADATA_MD5,
                               'integrity_verified': True, 'definitions': definitions},
            'header_points': sum(s['points'] for s in scenes),
            'sampled_points': sum(s['sample']['points'] for s in scenes),
            'schemas': schemas, 'plots': scenes,
            'limitations': ['Prefix samples are not representative estimates of whole-plot channel availability.',
                            'LAS payload hashes are copied from saved manifests, not recomputed by this audit.',
                            'Header descriptions report nearest-neighbor channels within 0.25 m; association accuracy and calibration are not validated.',
                            'Source YAML calls RGB scaled intensity; the public description calls it scaled reflectance. The physical quantity remains unresolved.',
                            'No preparation, model execution, cross-source calibration or independent accuracy is validated.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='Acquisition root containing sources/19351234')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--sample-points', type=int, default=10_000)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Choose a new evidence output path')
    result = audit(args.input.resolve(), args.sample_points)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(f"Inspected {len(result['plots'])} headers and {result['sampled_points']} points")
