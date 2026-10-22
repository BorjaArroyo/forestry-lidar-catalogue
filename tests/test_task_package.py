"""Independent contract checks against actual small producer outputs and corruptions."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
import numpy as np
from canopy.task_package import TaskPackage, SCHEMA, read_json, sha_file

REPO = Path(__file__).resolve().parents[1]

SPEC = importlib.util.spec_from_file_location(
    "producer_fixtures", REPO / "scripts/for_instance/test_pipeline.py"
)
fixtures = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixtures)


class ContractTests(unittest.TestCase):
    def setUp(self):
        # Reuse the producer's native LAS fixtures, not a hand-written ideal manifest.
        self.fixture = fixtures.PipelineTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        with (
            contextlib.redirect_stdout(io.StringIO()),
            patch.object(fixtures.pipeline, "CHUNK_POINTS", 5),
        ):
            self.manifest = fixtures.pipeline.prepare(
                self.fixture.source, self.fixture.output, self.fixture.package
            )
        self.root = self.fixture.output
        self.profile = self.fixture.package

    def save(self):
        (self.root / "task-package.json").write_text(json.dumps(self.manifest))

    def open(self):
        return TaskPackage(self.root, profile=self.profile)

    def change_chunk(self, change):
        chunk = self.manifest["scenes"][0]["chunks"][0]
        path = self.root / chunk["path"]
        with np.load(path, allow_pickle=False) as stored:
            arrays = {name: stored[name] for name in stored.files}
        change(arrays)
        np.savez(path, **arrays)
        chunk["sha256"] = sha_file(path)
        self.save()

    def test_real_producer_contract_and_scene_scoped_reading(self):
        Draft202012Validator.check_schema(read_json(SCHEMA))
        package = self.open()
        report = package.validate()
        self.assertEqual((report["plots"], report["points"], report["chunks"]), (2, 18, 4))
        self.assertEqual(report["manifest_sha256"], sha_file(self.root / "task-package.json"))
        for scene in package.scenes.values():
            chunks = list(package.iter_scene(scene["id"]))
            self.assertEqual([c.row_offset for c in chunks], [0, 5])
            self.assertEqual({c.scene_id for c in chunks}, {scene["id"]})
            np.testing.assert_array_equal(
                np.concatenate([c.instance for c in chunks]), [-1, -1, 0, -1, 17, 17, 18, -1, -1]
            )
            # Tree 17 spans two blocks; repeated IDs in different scenes remain distinct.
            self.assertEqual(chunks[0].instance[-1], 17)
            self.assertEqual(chunks[1].instance[0], 17)
            self.assertEqual(chunks[0].instance.dtype, np.dtype("int64"))
            self.assertFalse(chunks[0].xyz.flags.writeable)
            with self.assertRaises(ValueError):
                chunks[0].instance[0] = 0
        self.assertEqual([s["published_split"] for s in package.scenes.values()], ["dev", "test"])

    def test_reader_arrays_match_the_curated_graph_contract(self):
        graph = read_json(REPO / "knowledge-model.json")
        fields = graph["nodes"]["contract:for-instance-plot-instances:1.0.0"]["data"]["fields"]
        package = self.open()
        block = next(package.iter_scene(next(iter(package.scenes))))
        for field in fields:
            if field["name"] in {"published_split", "native_schema_ref", "original_points"}:
                continue
            array = getattr(block, field["name"])
            self.assertIn(str(array.dtype), field["dtypes"])
            self.assertEqual(
                list(array.shape), [len(block.instance) if n == "N" else n for n in field["shape"]]
            )

    def test_schema_rejects_future_version_and_unexpected_fields(self):
        for key, value in [("schema_version", "9.0.0"), ("accidental_field", True)]:
            changed = dict(self.manifest)
            changed[key] = value
            with self.assertRaises(ValidationError):
                Draft202012Validator(read_json(SCHEMA)).validate(changed)

    def test_duplicate_and_nonfinite_json_are_rejected(self):
        path = self.root / "task-package.json"
        for value in ['{"schema_version":"1.0.0","schema_version":"9"}', '{"value":NaN}']:
            path.write_text(value)
            with self.assertRaises(ValueError):
                self.open()

    def test_missing_scene_and_changed_split_are_rejected(self):
        self.manifest["scenes"][0]["published_split"] = "test"
        self.save()
        with self.assertRaisesRegex(ValueError, "provenance"):
            self.open()
        self.manifest["scenes"].pop()
        self.save()
        with self.assertRaisesRegex(ValueError, "membership"):
            self.open()

    def test_paths_row_offsets_and_duplicate_chunks_are_rejected(self):
        scene = self.manifest["scenes"][0]
        first, second = scene["chunks"][:2]
        original = first["path"]
        for name in [
            "../outside.npz",
            "/outside.npz",
            "plots/../outside.npz",
            "plots\\outside.npz",
            second["path"],
        ]:
            first["path"] = name
            self.save()
            with self.assertRaises(ValueError):
                self.open()
        first["path"] = original
        second["offset"] += 1
        self.save()
        with self.assertRaisesRegex(ValueError, "offsets"):
            self.open()

    def test_symlink_escape_is_rejected(self):
        first = self.manifest["scenes"][0]["chunks"][0]
        path = self.root / first["path"]
        path.unlink()
        path.symlink_to(self.profile / "policy.json")
        with self.assertRaisesRegex(ValueError, "escapes"):
            self.open()

    def test_corruption_without_checksum_update_is_rejected(self):
        path = self.root / self.manifest["scenes"][0]["chunks"][0]["path"]
        path.write_bytes(path.read_bytes() + b"corruption")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.open().validate()

    def test_rehashed_unknown_to_background_change_is_rejected(self):
        def change(arrays):
            arrays["instance"][0] = 0
            arrays["instance_valid"][0] = True

        self.change_chunk(change)
        with self.assertRaisesRegex(ValueError, "Reference differs"):
            self.open().validate()

    def test_rehashed_xyz_change_is_rejected(self):
        self.change_chunk(lambda arrays: arrays["xyz"].__setitem__((0, 0), float("nan")))
        with self.assertRaisesRegex(ValueError, "XYZ"):
            self.open().validate()

    def test_rehashed_dtype_change_is_rejected(self):
        self.change_chunk(
            lambda arrays: arrays.__setitem__("instance", arrays["instance"].astype("float64"))
        )
        with self.assertRaisesRegex(ValueError, "dtype"):
            self.open().validate()

    def test_rehashed_mask_change_is_rejected(self):
        self.change_chunk(lambda arrays: arrays["instance_valid"].__setitem__(0, True))
        with self.assertRaisesRegex(ValueError, "instance_valid"):
            self.open().validate()

    def test_rehashed_packed_native_class_change_is_rejected(self):
        def change(arrays):
            arrays["original_points"]["raw_classification"][0] = 7

        self.change_chunk(change)
        with self.assertRaisesRegex(ValueError, "Unknown native class"):
            self.open().validate()

    def test_whole_scene_counters_are_checked_on_exhaustion(self):
        scene = self.manifest["scenes"][0]
        scene["unknown_points"] -= 1
        scene["tree_points"] += 1
        self.save()
        package = self.open()
        # Opening metadata, or sampling one block, is not complete validation.
        next(package.iter_scene(scene["id"]))
        with self.assertRaisesRegex(ValueError, "Whole-scene"):
            package.validate()

    def test_manifest_replacement_during_validation_is_rejected(self):
        package = self.open()
        self.manifest["scope"] = "Changed after opening"
        self.save()
        with self.assertRaisesRegex(ValueError, "Manifest changed"):
            package.validate()

    def test_changed_policy_schema_and_trusted_profile_are_rejected(self):
        self.manifest["policy"]["tree"] = "Wrong policy"
        self.save()
        with self.assertRaisesRegex(ValueError, "policy"):
            self.open()
        self.manifest["policy"] = read_json(self.profile / "policy.json")
        native = next(iter(self.manifest["native_schemas"].values()))
        native["dimensions"][0]["description"] = "Changed descriptor"
        self.save()
        with self.assertRaisesRegex(ValueError, "schema fingerprint"):
            self.open()
        (self.profile / "policy.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "profile changed"):
            self.open()


if __name__ == "__main__":
    unittest.main()
