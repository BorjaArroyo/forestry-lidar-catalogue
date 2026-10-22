"""Refresh local browser integrity pins after reviewable implementation changes."""
import hashlib
import json
from pathlib import Path

from classification.snapshot import ROOT, HERE, write


def main():
    paths = [*sorted((ROOT/'browser-prepare').glob('classification-*.js')),
             ROOT/'browser-prepare/intake.js',
             ROOT/'scripts/source_identity.py',HERE/'requirements-audit.txt',
             *sorted(HERE.glob('*.py')),
             HERE/'source-lock.json', HERE/'vocabulary.json', HERE/'trees.json',
             HERE/'vendor-lock.json',
             ROOT/'tree-classification-plan.schema.json',ROOT/'tree-classification-dataset.schema.json',
             *sorted((HERE/'sources').glob('*')),
             *[ROOT/'browser-prepare/vendor'/name for name in json.loads((HERE/'vendor-lock.json').read_text())['files']
               if not name.endswith(('.cjs','.d.ts','.wasm')) or name=='laz-perf.wasm'],
             ROOT/'browser-prepare/vendor/zip.min.js', ROOT/'browser-prepare/vendor/zip-LICENSE']
    files = {str(p.relative_to(ROOT)):dict(path=str(p.relative_to(ROOT)),size_bytes=p.stat().st_size,
              sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in paths}
    write(ROOT/'browser-prepare/classification-runtime-lock.json',dict(schema_version='1.0.0',
        task_ref='task:species',runtime=dict(laz_perf='0.0.7',fzstd='0.1.1',hash_wasm='4.12.0',
        coordinates='IEEE-754 float64 native LAS scale and offset',block_points=250000),files=files))
    # Existing segmentation runtime still checks the updated shared intake code.
    path=ROOT/'browser-prepare/runtime-lock.json'; legacy=json.loads(path.read_text())
    for name, entry in legacy['files'].items():
        local=ROOT/name
        if local.is_file() and name.startswith(('scripts/','browser-prepare/')):
            entry.update(sha256=hashlib.sha256(local.read_bytes()).hexdigest(),size_bytes=local.stat().st_size)
    write(path,legacy)


if __name__=='__main__':
    main()
