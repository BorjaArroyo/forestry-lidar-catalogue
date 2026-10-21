"""Validate an acceptance ZIP with the unchanged native reader, one materialized NPZ at a time."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import task_package
from knowledge_model import load
from task_dataset import TaskDataset


def validate(archive, *, reference, scratch_parent=None):
    expected = {}
    evidence = json.loads(reference.read_text())
    for source in evidence['browser_run']['sources']:
        record = source['task_plan']['source_ref'].replace('zenodo:', 'zenodo-')
        for scene in source['prepared_scenes']:
            for chunk in scene['chunks']:
                expected[f"{scene['published_split']}/{record}/{chunk['path']}"] = chunk['sha256']
    with zipfile.ZipFile(archive) as zipped, tempfile.TemporaryDirectory(dir=scratch_parent) as scratch:
        root = Path(scratch).resolve()
        names = zipped.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate archive members')
        for name in names:
            task_package.inside(root, name.rstrip('/'))
        metadata = [name for name in names if not name.endswith('.npz')]
        largest = max((entry.file_size for entry in zipped.infolist()), default=0)
        needed = largest + sum(zipped.getinfo(name).file_size for name in metadata) + 64 * 1024**2
        if shutil.disk_usage(root).free < needed:
            raise OSError('Insufficient space for metadata, one NPZ and the validation reserve')
        if zipped.testzip() is not None:
            raise ValueError('ZIP CRC failed')
        for name in metadata:
            zipped.extract(name, root)
        original_read = task_package.TaskPackage._read_chunk

        def materialized_read(package, scene, chunk):
            path = task_package.inside(package.root, chunk['path'])
            zipped.extract(path.relative_to(root).as_posix(), root)
            try:
                return original_read(package, scene, chunk)
            finally:
                path.unlink()

        # Only storage materialization changes; every native checksum, array and policy check runs.
        with patch.object(task_package.TaskPackage, '_read_chunk', materialized_read):
            report = TaskDataset(root, load()).validate()
        actual = {}
        for name in names:
            if name.endswith('.npz'):
                with zipped.open(name) as stream:
                    actual[name] = hashlib.file_digest(stream, 'sha256').hexdigest()
        if actual != expected:
            raise ValueError('Block membership or bytes differ from the native reference evidence')
        run = json.loads((root / 'browser-run.json').read_text())
    with archive.open('rb') as stream:
        archive_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
    return dict(status='succeeded', user_agent=run['user_agent'], runtime_lock_sha256=run['runtime_lock_sha256'],
                archive_sha256=archive_hash, size_bytes=archive.stat().st_size, zip_crc='passed', report=report,
                matching_native_chunks=len(actual), plan_sha256=run['dataset_plan']['plan_sha256'],
                native_validation='Unchanged TaskDataset and TaskPackage checks; complete NPZ files materialized one at a time',
                plot_paths=[scene['path'] for scene in run['prepared_scenes']])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--reference', type=Path, default=ROOT / 'evidence/combined-browser-expanded-validation.json')
    parser.add_argument('--scratch-parent', type=Path)
    args = parser.parse_args()
    if args.report.exists():
        raise ValueError('Choose a new report destination')
    result = validate(args.archive.resolve(), reference=args.reference, scratch_parent=args.scratch_parent)
    args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
