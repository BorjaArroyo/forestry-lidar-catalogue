"""Synthetic checks for TLS duplicate-index validation, without network or data mutation."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from entrypoint import validate, verify_package


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)
        self.root, self.output = self.directory / "inputs", self.directory / "outputs"
        self.items = []
        for split in ("train", "val"):
            name = f"sources/16875688/originals/{split}/tree.ply"
            path = self.root / name
            path.parent.mkdir(parents=True)
            path.write_bytes(b"synthetic test bytes")
            self.items.append({"path": name, "size_bytes": path.stat().st_size,
                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        self.contract = {"pipeline_id": "tls-exact-duplicate-index-v1", "source": {"record_id": "16875688"}, "inputs": self.items}

    def test_preserves_all_sources_and_leaves_decisions_open(self):
        result = validate(self.contract, self.root, self.output)
        self.assertTrue(result["full_input_validation"])
        self.assertFalse(result["curation_applied"])
        self.assertIsNone(result["candidate_groups"][0]["canonical_path"])
        self.assertEqual((self.root / self.items[0]["path"]).read_bytes(), b"synthetic test bytes")

    def test_same_size_corruption_fails_before_output(self):
        path = self.root / self.items[0]["path"]
        path.write_bytes(b"x" * path.stat().st_size)
        with self.assertRaisesRegex(ValueError, "checksum"):
            validate(self.contract, self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_missing_input(self):
        (self.root / self.items[0]["path"]).unlink()
        with self.assertRaises(FileNotFoundError):
            validate(self.contract, self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_output_never_overwrites_or_enters_inputs(self):
        self.output.mkdir()
        with self.assertRaises(ValueError):
            validate(self.contract, self.root, self.output)
        with self.assertRaises(ValueError):
            validate(self.contract, self.root, self.root / "outputs")

    def test_source_and_path_contract(self):
        for key, value in (("source", {"record_id": "1"}), ("pipeline_id", "unknown")):
            changed = copy.deepcopy(self.contract)
            changed[key] = value
            with self.assertRaises(ValueError):
                validate(changed, self.root, self.output)
        self.items[0]["path"] = "../escape.ply"
        with self.assertRaises(ValueError):
            validate(self.contract, self.root, self.output)

    def test_symlinks_are_blocked(self):
        path = self.root / self.items[0]["path"]
        path.unlink()
        path.symlink_to(self.root / self.items[1]["path"])
        with self.assertRaises(ValueError):
            validate(self.contract, self.root, self.output)

    def test_partial_validation_is_explicit(self):
        for item in copy.deepcopy(self.items):
            path = self.root / (item["path"] + ".second.ply")
            path.write_bytes(b"larger synthetic payload")
            self.items.append({"path": str(path.relative_to(self.root)), "size_bytes": path.stat().st_size,
                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        result = validate(self.contract, self.root, self.output, 1)
        self.assertFalse(result["full_input_validation"])
        self.assertEqual(len(result["checked_files"]), 2)
        self.assertEqual(result["declared_files"], 4)

    def test_package_tampering(self):
        package = self.directory / "package"
        package.mkdir()
        (package / "entrypoint.py").write_bytes(b"fixture")
        (package / "package-lock.json").write_text(json.dumps({"files": {"entrypoint.py": hashlib.sha256(b"fixture").hexdigest()}}))
        verify_package(package)
        (package / "entrypoint.py").write_bytes(b"modified")
        with self.assertRaises(ValueError):
            verify_package(package)


if __name__ == "__main__":
    unittest.main()
