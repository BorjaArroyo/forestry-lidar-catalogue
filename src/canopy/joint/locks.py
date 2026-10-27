"""Refresh the joint route's explicit local dependencies without changing admission."""

import hashlib
import json

from canopy.paths import repository_root


def main():
    root = repository_root()
    names = [
        "browser-prepare/runtime-lock.json",
        "browser-prepare/runtime.js",
        "browser-prepare/classification-runtime.js",
        "browser-prepare/classification-model.js",
        "browser-prepare/classification-las.js",
        "browser-prepare/intake.js",
        "browser-prepare/export.js",
        "browser-prepare/storage.js",
        "browser-prepare/run-store.js",
        "data/joint/source-lock.json",
        *[
            "browser-prepare/vendor/" + name
            for name in [
                "md5.umd.js",
                "sha256.umd.js",
                "laz-perf.js",
                "laz-perf.wasm",
                "zip.min.js",
            ]
        ],
    ]
    names += [
        path.relative_to(root).as_posix()
        for path in sorted((root / "browser-prepare").glob("joint-*.js"))
    ]
    files = {}
    for name in names:
        data = (root / name).read_bytes()
        files[name] = dict(path=name, size_bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    (root / "browser-prepare/joint-runtime-lock.json").write_text(
        json.dumps(dict(schema_version="1.0.0", files=files), indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
