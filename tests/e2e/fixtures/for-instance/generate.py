"""Regenerate the deterministic synthetic FOR-instance fixture for the kernel e2e test.

The fixture is a self-contained synthetic "reviewed release" package: a small LAS
plot plus a source lock whose plot entry carries the file's real SHA256. It lets
the real audited preparation kernel run end to end in the pinned Pyodide runtime
without the 1.6 GB provider archive. ``prepare.py`` and ``requirements.txt`` are
never duplicated here; the browser test fetches their audited bytes at runtime
and ``package-lock.json`` pins those hashes, so the fixture genuinely executes
the audited policy code.

Run from anywhere with the repository environment active (uv sync --extra dev):

    .venv/bin/python tests/e2e/fixtures/for-instance/generate.py
"""

import hashlib
import json
import shutil
from pathlib import Path

import laspy
import numpy as np

FIXTURE = Path(__file__).resolve().parent
AUDITED = FIXTURE.parents[3] / "scripts" / "for_instance"

POINTS = 3_000
SCALES = [0.001, 0.001, 0.001]
OFFSETS = [0.0, 0.0, 0.0]
PLOT_PATH = "sources/8287792/originals/FORinstance_dataset/synthetic/plot_synthetic.las"
PUBLISHED_SPLIT = "dev"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build_plot():
    """Write a deterministic point-format-6 LAS with audited-contract fields."""
    rng = np.random.default_rng(8287792)
    order = rng.permutation(POINTS)
    classification = np.zeros(POINTS, dtype=np.uint8)
    classification[order[:1000]] = 2  # ground: instance 0 in the audited policy
    classification[order[1000:1300]] = 0  # unclassified: retained, instance -1
    classification[order[1300:1600]] = 1
    classification[order[1600:1900]] = 3
    trees = order[1900:]
    classification[trees] = np.resize(np.array([4, 5, 6], dtype=np.uint8), len(trees))
    tree_ids = np.zeros(POINTS, dtype=np.float64)
    tree_ids[trees] = np.resize(np.arange(1, 111, dtype=np.float64), len(trees))

    header = laspy.LasHeader(version="1.4", point_format=6)
    header.scales = np.array(SCALES)
    header.offsets = np.array(OFFSETS)
    plot = laspy.LasData(header)
    plot.x = rng.uniform(0.0, 40.0, POINTS)
    plot.y = rng.uniform(0.0, 40.0, POINTS)
    plot.z = rng.uniform(0.0, 25.0, POINTS)
    plot.classification = classification
    plot.add_extra_dim(laspy.ExtraBytesParams(name="treeID", type=np.float64))
    plot.treeID = tree_ids
    plot.write(FIXTURE / "plot.las")

    raw = (FIXTURE / "plot.las").read_bytes()
    return {
        "path": PLOT_PATH,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "size_bytes": len(raw),
        "points": POINTS,
        "class_counts": np.bincount(classification, minlength=7).tolist(),
        "published_split": PUBLISHED_SPLIT,
        "scales": SCALES,
        "offsets": OFFSETS,
        "crs": "EPSG:25833",
    }


def main():
    plot = build_plot()
    marker = b"forestry-lidar-catalogue synthetic for-instance e2e fixture"
    lock = {
        "record_id": 8287792,
        "download_sha256": hashlib.sha256(marker).hexdigest(),
        "provider_checksum": "md5:" + hashlib.md5(marker).hexdigest(),
        "plots": [plot],
        "unmatched_split_rows": [],
    }
    (FIXTURE / "source-lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    shutil.copyfile(AUDITED / "policy.json", FIXTURE / "policy.json")
    package_lock = {
        "files": {
            "prepare.py": sha(AUDITED / "prepare.py"),
            "requirements.txt": sha(AUDITED / "requirements.txt"),
            "source-lock.json": sha(FIXTURE / "source-lock.json"),
            "policy.json": sha(FIXTURE / "policy.json"),
        }
    }
    (FIXTURE / "package-lock.json").write_text(json.dumps(package_lock, indent=2) + "\n")
    print(
        "plot.las",
        plot["sha256"],
        plot["size_bytes"],
        "bytes; class_counts",
        plot["class_counts"],
    )


if __name__ == "__main__":
    main()
