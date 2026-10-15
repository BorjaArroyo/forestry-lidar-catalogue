"""Fault injection tests for verified local materialization."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from staging import materialize, stream_copy


class StagingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root, self.stage = self.base / "source", self.base / "stage"
        self.name = "sources/16875688/originals/train/tree.ply"
        self.source = self.root / self.name
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(b"correct payload")
        self.item = {"path": self.name, "size_bytes": 15, "sha256": hashlib.sha256(b"correct payload").hexdigest()}
        self.contract = {"inputs": [self.item]}

    def test_exact_copy_preserves_original_and_verifies_local(self):
        result = materialize(self.contract, self.root, self.stage)
        self.assertEqual(result["status"], "verified")
        self.assertEqual((self.stage / self.name).read_bytes(), self.source.read_bytes())
        self.assertEqual(self.source.read_bytes(), b"correct payload")

    def test_faulty_read_is_recorded_before_verified_retry(self):
        calls = []
        def flaky(source, target):
            calls.append(1)
            if len(calls) == 1:
                target.write_bytes(b"x" * 15)
                return hashlib.sha256(b"x" * 15).hexdigest(), 15
            return stream_copy(source, target)
        result = materialize(self.contract, self.root, self.stage, copier=flaky)
        self.assertEqual(len(result["read_failures"]), 1)
        self.assertEqual(result["files"][0]["attempts"], 2)
        self.assertEqual((self.stage / self.name).read_bytes(), b"correct payload")

    def test_persistent_mismatch_is_not_admitted(self):
        self.source.write_bytes(b"x" * 15)
        with self.assertRaises(ValueError):
            materialize(self.contract, self.root, self.stage)
        self.assertEqual(json.loads((self.stage / "staging-report.json").read_text())["status"], "failed")
        self.assertFalse((self.stage / self.name).exists())

    def test_short_read_is_rejected(self):
        def short(source, target):
            target.write_bytes(b"correct")
            return hashlib.sha256(b"correct").hexdigest(), 7
        with self.assertRaises(ValueError):
            materialize(self.contract, self.root, self.stage, copier=short)
        self.assertFalse((self.stage / self.name).exists())

    def test_local_corruption_is_rejected(self):
        def bad_disk(source, target):
            target.write_bytes(b"x" * 15)
            return self.item["sha256"], 15
        with self.assertRaises(ValueError):
            materialize(self.contract, self.root, self.stage, copier=bad_disk)

    def test_staging_composes_with_pipeline_validation(self):
        from entrypoint import validate
        other = dict(self.item, path=self.name.replace("train/", "val/"))
        target = self.root / other["path"]
        target.parent.mkdir(parents=True)
        target.write_bytes(b"correct payload")
        self.contract.update(pipeline_id="tls-exact-duplicate-index-v1", source={"record_id": "16875688"})
        self.contract["inputs"].append(other)
        materialize(self.contract, self.root, self.stage)
        report = validate(self.contract, self.stage, self.base / "result")
        self.assertTrue(report["full_input_validation"])
        self.assertEqual(len(report["checked_files"]), 2)
        self.assertFalse(report["curation_applied"])

    def test_unsafe_destinations_and_symlinks(self):
        with self.assertRaises(ValueError):
            materialize(self.contract, self.root, self.root / "stage")
        self.source.unlink()
        self.source.symlink_to(self.base / "outside")
        with self.assertRaises(ValueError):
            materialize(self.contract, self.root, self.stage)


if __name__ == "__main__":
    unittest.main()
