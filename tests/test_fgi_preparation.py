"""Independent checks for FGI references, native channels and masked missingness."""

from canopy.adapters import load_adapter

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import laspy
import numpy as np
from canopy.task_package import TaskPackage

ROOT = Path(__file__).resolve().parents[1]

adapter = load_adapter("fgi_emit")
Preparation, prepare, reference, sha = (
    adapter.Preparation,
    adapter.prepare,
    adapter.reference,
    adapter.sha,
)


class FgiPreparation(unittest.TestCase):
    def setUp(self):
        (ROOT / "temp").mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=ROOT / "temp")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.profile = self.base / "profile"
        self.profile.mkdir()
        for name in ["prepare.py", "requirements.txt", "policy.json"]:
            shutil.copy2(ROOT / "scripts/fgi_emit" / name, self.profile / name)
        self.source = self.base / "plot.las"
        self.output = self.base / "output"
        self.output.mkdir()
        header = laspy.LasHeader(point_format=7, version="1.4")
        for name, dtype in [("tree_index", "uint16"), ("edge", "uint8"), ("dead", "uint8")] + [
            (f"reflectance_{i}", "float32") for i in [1, 2, 3]
        ]:
            header.add_extra_dim(laspy.ExtraBytesParams(name=name, type=dtype))
        header.add_extra_dim(
            laspy.ExtraBytesParams(name="auxiliary", type="int16", scales=[1.0], offsets=[0.0])
        )
        las = laspy.LasData(header)
        las.x = np.arange(9, dtype=float)
        las.y = np.arange(9, dtype=float) + 1
        las.z = np.arange(9, dtype=float) + 2
        las.classification = np.array([0, 1, 2, 3, 4, 5, 1, 1, 0], dtype="uint8")
        las.tree_index = np.array([0, 7, 0, 0, 0, 0, 0, 7, 0], dtype="uint16")
        las.user_data = np.array([1, 2, 3] * 3, dtype="uint8")
        las.edge = np.zeros(9, dtype="uint8")
        las.dead = np.zeros(9, dtype="uint8")
        for i in [1, 2, 3]:
            las[f"reflectance_{i}"] = np.array(
                [-9999, 1, np.nan, 2, 3, 4, 5, 6, 7], dtype="float32"
            ) + np.float32(0 if i == 1 else i)
        las.write(self.source)
        h = laspy.read(self.source).header
        row = dict(
            path="sources/19351234/originals/training/training/plot_1001.las",
            sha256=sha(self.source),
            size_bytes=self.source.stat().st_size,
            points=9,
            published_split="train",
            crs=None,
            scales=h.scales.tolist(),
            offsets=h.offsets.tolist(),
            class_counts=[2, 3, 1, 1, 1, 1],
        )
        lock = dict(
            record_id=19351234,
            archives=[
                dict(name=name, sha256="a" * 64, provider_checksum="md5:" + "b" * 32)
                for name in ["training.zip", "test.zip"]
            ],
            plots=[row],
        )
        self.save(self.profile / "source-lock.json", lock)
        self.save(
            self.profile / "package-lock.json",
            dict(
                files={
                    name: sha(self.profile / name)
                    for name in [
                        "prepare.py",
                        "source-lock.json",
                        "policy.json",
                        "requirements.txt",
                    ]
                }
            ),
        )
        prep = Preparation(self.source, self.profile)
        while True:
            path = self.output / "block.npz"
            chunk = prep.next_block(path)
            if chunk is None:
                break
            target = self.output / chunk["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            path.rename(target)
        self.manifest = prep.manifest
        self.save(self.output / "task-package.json", self.manifest)

    def save(self, path, value):
        path.write_text(json.dumps(value, indent=2) + "\n")

    def test_native_fields_reference_and_channel_masks_are_preserved(self):
        package = TaskPackage(self.output, profile=self.profile, allow_selection=True)
        report = package.validate()
        self.assertEqual(report["points"], 9)
        block = next(package.iter_scene(next(iter(package.scenes))))
        np.testing.assert_array_equal(block.instance, [-1, 7, 0, 0, 0, -1, -1, 7, -1])
        np.testing.assert_array_equal(
            block.instance_valid, [False, True, True, True, True, False, False, True, False]
        )
        self.assertFalse(block.feature_valid[0, 0])
        self.assertTrue(block.feature_valid[0, 1])
        self.assertFalse(block.feature_valid[2].any())
        self.assertEqual(block.features[0, 0], -9999)
        self.assertTrue(np.isnan(block.features[2]).all())
        self.assertEqual(
            block.original_points.tobytes(), laspy.read(self.source).points.array.tobytes()
        )
        self.assertFalse(block.features.flags.writeable)

    def test_tampered_feature_mask_fails_independent_payload_validation(self):
        chunk = self.manifest["scenes"][0]["chunks"][0]
        path = self.output / chunk["path"]
        with np.load(path, allow_pickle=False) as stored:
            arrays = {name: stored[name] for name in stored.files}
        arrays["feature_valid"][0, 0] = True
        np.savez(path, **arrays)
        chunk["sha256"] = sha(path)
        self.save(self.output / "task-package.json", self.manifest)
        with self.assertRaisesRegex(ValueError, "Spectral"):
            TaskPackage(self.output, profile=self.profile, allow_selection=True).validate()

    def test_native_entrypoint_creates_a_new_independently_readable_package(self):
        output = self.base / "native-package"
        prepare(self.source, output, self.profile)
        self.assertEqual(
            TaskPackage(output, profile=self.profile, allow_selection=True).validate()["points"], 9
        )
        self.assertFalse((output / ".incomplete.json").exists())
        with self.assertRaises(ValueError):
            prepare(self.source, output, self.profile)

    def test_browser_json_bridge_preserves_numeric_native_schema_fingerprints(self):
        text = json.dumps(self.manifest)
        script = "process.stdout.write(JSON.stringify([require('node:fs').readFileSync(0,'utf8')]))"
        envelope = subprocess.check_output(["node", "-e", script], input=text, text=True)
        restored = json.loads(json.loads(envelope)[0])
        self.assertEqual(restored, self.manifest)
        self.save(self.output / "task-package.json", restored)
        self.assertEqual(
            TaskPackage(self.output, profile=self.profile, allow_selection=True).validate()[
                "points"
            ],
            9,
        )

    def test_unknown_native_classes_and_conflicting_positive_ids_fail(self):
        for classes, ids in [([6], [0]), ([2], [1]), ([1], [-1])]:
            with self.assertRaises(ValueError):
                reference(np.array(classes), np.array(ids))


if __name__ == "__main__":
    unittest.main()
