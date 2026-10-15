"""Offline checks for evidence-only curation planning."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from plan_lidar_curation import build_plan, split_hints


class CurationPlanTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.manifests = self.root / "sources/1/manifests"
        self.manifests.mkdir(parents=True)
        self.rows = []
        for name, payload in (("a.ply", b"same"), ("b.ply", b"same"), ("c.ply", b"other")):
            (self.root / name).write_bytes(payload)
            self.rows.append({"path": name, "size_bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
        self.write_manifest()

    def write_manifest(self):
        (self.manifests / "asset.json").write_text(json.dumps({"outputs": self.rows}))

    def scenes(self):
        rows = [{"scene_id": name, "input": name, "input_sha256": self.rows[i]["sha256"],
                 "status": "verified", "point_count": 2, "semantic_classes": {"0": "unknown"},
                 "chunks": [{"sha256": "f" * 64, "point_count": 2, "point_offset": 0}]}
                for i, name in ((1, "b.ply"), (2, "c.ply"))]
        return rows

    def save_status(self, rows):
        (self.root / "acquisition-status.json").write_text(json.dumps({"harmonized": rows}))

    def test_transitive_identity_preserves_originals(self):
        self.save_status(self.scenes())
        report = build_plan(self.root, True)
        self.assertFalse(report["errors"])
        self.assertEqual(report["identity_groups"][0]["paths"], ["a.ply", "b.ply", "c.ply"])
        self.assertIsNone(report["identity_groups"][0]["canonical_path"])
        self.assertFalse(report["curation_applied"])
        self.assertEqual((self.root / "a.ply").read_bytes(), b"same")

    def test_appledouble_and_repeated_manifests(self):
        (self.manifests / "._asset.json").write_bytes(b"binary sidecar")
        (self.manifests / "second.json").write_text(json.dumps({"outputs": self.rows}))
        report = build_plan(self.root)
        self.assertEqual(report["files"], 3)
        self.assertEqual(len(report["duplicate_groups"]), 1)
        self.assertEqual(report["scope"]["ignored_appledouble_manifests"], 1)
        self.assertEqual(report["scope"]["source_size_checks"], 0)

    def test_size_check_does_not_claim_rehash(self):
        (self.root / "a.ply").write_bytes(b"edit")
        report = build_plan(self.root, True)
        self.assertFalse(report["errors"])
        self.assertFalse(report["scope"]["payloads_rehashed"])
        (self.root / "b.ply").unlink()
        self.assertEqual(len(build_plan(self.root, True)["errors"]), 1)

    def test_path_escape_and_symlink(self):
        self.rows[0]["path"] = "../outside"
        self.write_manifest()
        with self.assertRaises(ValueError):
            build_plan(self.root)
        self.rows[0]["path"] = "a.ply"
        self.write_manifest()
        (self.root / "a.ply").unlink()
        (self.root / "a.ply").symlink_to(self.root / "c.ply")
        with self.assertRaises(ValueError):
            build_plan(self.root, True)

    def test_invalid_chunk_sequence(self):
        scenes = self.scenes()
        scenes[0]["chunks"][0]["point_offset"] = 1
        self.save_status(scenes)
        report = build_plan(self.root)
        self.assertEqual(len(report["errors"]), 1)
        self.assertFalse(report["normalized_duplicate_groups"])

    def test_metadata_conflict(self):
        scenes = self.scenes()
        scenes[1]["semantic_classes"] = {"0": "ground"}
        self.save_status(scenes)
        self.assertTrue(build_plan(self.root)["normalized_duplicate_groups"][0]["metadata_conflict"])

    def test_source_hash_mismatch(self):
        scenes = self.scenes()
        scenes[0]["input_sha256"] = "0" * 64
        self.save_status(scenes)
        self.assertTrue(build_plan(self.root)["errors"])

    def test_support_files_are_not_cloud_identities(self):
        for row in self.rows:
            row["path"] = row["path"].replace(".ply", ".ipynb")
        self.write_manifest()
        report = build_plan(self.root)
        self.assertEqual(report["duplicate_groups"][0]["kind"], "support_files")
        self.assertFalse(report["identity_groups"])

    def test_split_folder_hints_are_explicit(self):
        self.assertEqual(split_hints(["sources/1/train/tree.ply", "sources/1/validation/tree.ply"]), ["train", "validation"])
        self.assertEqual(split_hints(["sources/1/train_tree.ply"]), [])

    def test_conflicting_manifest(self):
        conflict = dict(self.rows[0], size_bytes=200)
        (self.manifests / "other.json").write_text(json.dumps({"outputs": [conflict]}))
        self.assertTrue(build_plan(self.root)["errors"])


if __name__ == "__main__":
    unittest.main()
