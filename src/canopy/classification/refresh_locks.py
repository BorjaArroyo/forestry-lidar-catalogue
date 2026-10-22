"""Refresh the classification runtime's explicit local artifact pins."""

from canopy.classification.dataio import read_json

import hashlib
import json
from canopy.paths import repository_root


def main():
    root = repository_root()
    paths = [
        *sorted((root / "browser-prepare").glob("classification-*.js")),
        root / "browser-prepare/intake.js",
        *sorted((root / "src/canopy/classification").glob("*.py")),
        *sorted((root / "data/classification").glob("*.json*")),
        *sorted((root / "data/classification/sources").glob("*")),
        *sorted((root / "schemas").glob("tree-classification-*.schema.json")),
        root / "data/knowledge-model.json",
    ]
    vendor = read_json(root / "data/classification/vendor-lock.json")["files"]
    paths.extend(
        root / "browser-prepare/vendor" / name
        for name in vendor
        if not name.endswith((".cjs", ".d.ts", ".wasm")) or name == "laz-perf.wasm"
    )
    paths.extend(root / "browser-prepare/vendor" / name for name in ["zip.min.js", "zip-LICENSE"])
    files = {
        str(p.relative_to(root)).removesuffix(".gz"): dict(
            path=str(p.relative_to(root)),
            size_bytes=p.stat().st_size,
            sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
        )
        for p in paths
    }
    document = dict(schema_version="1.0.0", task_ref="task:species", files=files)
    (root / "browser-prepare/classification-runtime-lock.json").write_text(
        json.dumps(document, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
