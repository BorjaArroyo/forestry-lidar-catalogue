"""Joint point/tree identities, rank masks, frozen plans and corruption checks."""

import copy
import json
from pathlib import Path
import tempfile
import unittest

import laspy
import numpy as np

from canopy.classification.canonical import fingerprint
from canopy.joint.model import PIPELINE, SOURCE, check, load_source, require_admitted, resolve
from canopy.joint.package import JointDataset, prepare_native
from canopy.joint.source import encoded, inspect_plot
from canopy.loader import LoaderConfig, open_dataset
from canopy.task_package import sha_file


def fixture(root):
    """Native IDs are sparse; companion IDs deliberately do not establish identity."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    path = root / "synthetic.laz"
    header = laspy.LasHeader(point_format=0, version="1.2")
    header.scales = np.array([0.001, 0.01, 0.1])
    header.offsets = np.array([4000000.0, -2000.0, 50.0])
    for name, dtype in [("treeID", "i2"), ("treeSP", "i2"), ("completelyInside", "u1")]:
        header.add_extra_dim(laspy.ExtraBytesParams(name=name, type=dtype))
    cloud = laspy.LasData(header)
    cloud.X = np.arange(12, dtype=np.int32)
    cloud.Y = -np.arange(12, dtype=np.int32)
    cloud.Z = np.arange(12, dtype=np.int32) * 2
    cloud.treeID = np.array([0, 3, 3, 11, 11, 22, 22, 31, 31, 0, 3, 11], dtype=np.int16)
    cloud.treeSP = np.array([0, 1, 1, 40, 40, 0, 0, 1, 1, 0, 1, 40], dtype=np.int16)
    cloud.completelyInside = np.array([0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1], dtype=np.uint8)
    cloud.write(path, do_compress=False)
    taxonomy = [
        dict(
            native_code=1,
            native_name="Pinus sylvestris",
            genus="Pinus",
            leaf_group="conifer",
            species="Pinus sylvestris",
        ),
        dict(
            native_code=40,
            native_name="Quercus sp.",
            genus="Quercus",
            leaf_group="broadleaf",
            species=None,
        ),
    ]
    plot = inspect_plot(
        path,
        dict(
            path=path.name,
            archive="synthetic.zip",
            size_bytes=path.stat().st_size,
            compressed_size=path.stat().st_size,
            crc32="00000000",
        ),
        [],
        taxonomy,
    )
    source = dict(
        schema_version="1.0.0",
        source_ref=SOURCE,
        pipeline_ref=PIPELINE,
        taxonomy=taxonomy,
        plots=[plot],
        archives=[
            dict(
                name="synthetic.zip",
                size_bytes=path.stat().st_size,
                checksum="md5:" + "a" * 32,
                download_url="https://example.test/synthetic.zip",
            )
        ],
        admission=dict(status="admitted", authorization="Synthetic test fixture only"),
    )
    source["admission"]["approved_plots"] = [plot["path"]]
    source["admission"]["source_scope_sha256"] = fingerprint(
        {key: value for key, value in source.items() if key != "admission"}
    )
    return source


def request(**update):
    return (
        dict(plots=["synthetic.laz"], target="species", policy="partial", complete_crowns=False)
        | update
    )


class JointScopeTests(unittest.TestCase):
    def test_expanded_registry_matches_native_audit_and_admission(self):
        root = Path(__file__).resolve().parents[1]
        source = load_source()
        audit = json.loads((root / "evidence/joint/expanded-native-audit.json").read_text())
        registered = {plot["path"]: plot for plot in source["plots"]}
        for plot in audit["plots"]:
            self.assertEqual(registered[plot["path"]], plot)
            self.assertIn(plot["archive"], {item["name"] for item in source["archives"]})
        require_admitted(source)


class JointTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.source = fixture(self.root / "input")
        self.plan = resolve(self.source, request(), runtime_sha256="a" * 64)
        self.output = self.root / "output"

    def prepare(self, plan=None):
        return prepare_native(self.source, plan or self.plan, self.root / "input", self.output)

    def test_tree_taxonomy_and_point_instance_axes_stay_separate(self):
        report = self.prepare()
        self.assertEqual((report["points"], report["trees"]), (12, 4))
        dataset = open_dataset(self.output, LoaderConfig(block_points=2))
        blocks = list(dataset)
        self.assertEqual(len(blocks), 6)
        for block in blocks:
            self.assertEqual(block["arrays"]["xyz"].shape, (2, 3))
            self.assertEqual(block["tree_arrays"]["taxonomy"].shape, (4,))
            self.assertNotIn("taxonomy", block["arrays"])
            self.assertFalse(block["tree_arrays"]["taxonomy"].flags.writeable)
        np.testing.assert_array_equal(
            np.concatenate([b["arrays"]["point_to_tree"] for b in blocks]),
            [-1, 0, 0, 1, 1, 2, 2, 3, 3, -1, 0, 1],
        )
        np.testing.assert_array_equal(
            blocks[0]["tree_arrays"]["taxonomy_valid"], [True, False, False, True]
        )
        self.assertEqual(blocks[0]["trees"][1]["taxonomy_unavailable_reason"], "coarser_rank")
        self.assertEqual(
            blocks[0]["trees"][2]["taxonomy_unavailable_reason"], "unknown_native_reference"
        )

    def test_joint_policy_and_crowns_change_eligibility_without_dropping_points(self):
        plan = resolve(
            self.source, request(policy="joint", complete_crowns=True), runtime_sha256="a" * 64
        )
        self.prepare(plan)
        block = next(iter(open_dataset(self.output)))
        self.assertEqual(len(block["arrays"]["instance"]), 12)
        np.testing.assert_array_equal(
            block["tree_arrays"]["instance_eligible"], [True, False, False, False]
        )
        np.testing.assert_array_equal(
            block["tree_arrays"]["taxonomy_valid"], [True, False, False, True]
        )
        genus = resolve(
            self.source, request(policy="joint", target="genus"), runtime_sha256="a" * 64
        )
        self.assertEqual(genus["totals"]["taxonomy_eligible"], 3)

    def test_changed_policy_current_pins_and_unknown_plots_require_review(self):
        changed = copy.deepcopy(self.plan)
        changed["request"]["policy"] = "joint"
        for plan, runtime in [(changed, "a" * 64), (self.plan, "b" * 64)]:
            with self.assertRaisesRegex(ValueError, "stale"):
                check(self.source, plan, runtime_sha256=runtime)
        for update in [
            dict(plots=["../bad.laz"]),
            dict(policy=None),
            dict(plots=["synthetic.laz"] * 2),
        ]:
            with self.assertRaises(ValueError):
                resolve(self.source, request(**update), runtime_sha256="a" * 64)

    def test_source_audit_is_not_scientific_admission(self):
        self.source["admission"] = dict(status="pending")
        plan = resolve(self.source, request(), runtime_sha256="a" * 64)
        with self.assertRaisesRegex(ValueError, "Maintainer scientific admission"):
            self.prepare(plan)
        self.assertFalse(self.output.exists())

    def corrupt_block(self, field, change):
        self.prepare()
        manifest = json.loads((self.output / "dataset.json").read_text())
        block = manifest["plots"][0]["blocks"][0]
        path = self.output / block["path"]
        with np.load(path, allow_pickle=False) as archive:
            arrays = {key: archive[key] for key in archive.files}
        change(arrays[field])
        np.savez(path, **arrays)
        block["sha256"] = sha_file(path)
        (self.output / "dataset.json").write_bytes(encoded(manifest))

    def test_rehashed_point_links_cannot_change_tree_identity(self):
        self.corrupt_block("point_to_tree", lambda a: a.__setitem__(1, 1))
        with self.assertRaisesRegex(ValueError, "point-to-tree identity"):
            JointDataset(self.output).validate()

    def test_rehashed_point_masks_cannot_turn_unassigned_into_background(self):
        self.corrupt_block("instance_valid", lambda a: a.__setitem__(0, True))
        with self.assertRaisesRegex(ValueError, "validity changed"):
            JointDataset(self.output).validate()

    def test_rehashed_native_records_are_checked_against_original_audit(self):
        self.corrupt_block("native_records", lambda a: a["treeSP"].__setitem__(1, 40))
        with self.assertRaisesRegex(ValueError, "audited input"):
            JointDataset(self.output).validate()

    def test_tree_table_changes_cannot_relabel_unknown_species(self):
        self.prepare()
        path = self.output / "dataset.json"
        manifest = json.loads(path.read_text())
        manifest["plots"][0]["trees"][2]["taxonomy"] = 0
        path.write_bytes(encoded(manifest))
        with self.assertRaisesRegex(ValueError, "tree reference or eligibility"):
            JointDataset(self.output)

    def test_selected_taxonomy_automatically_keeps_its_mask_and_tree_axis(self):
        self.prepare()
        block = next(
            iter(
                open_dataset(self.output, LoaderConfig(fields=("xyz", "taxonomy"), block_points=1))
            )
        )
        self.assertEqual(set(block["arrays"]), {"xyz"})
        self.assertEqual(set(block["tree_arrays"]), {"taxonomy", "taxonomy_valid"})
        self.assertEqual(len(block["tree_arrays"]["taxonomy"]), 4)

    def test_embedded_plans_do_not_need_current_source_admission_to_read_old_exports(self):
        self.prepare()
        dataset = open_dataset(self.output)
        self.assertEqual(dataset.validate()["status"], "validated")
        self.assertEqual(fingerprint(dataset._reader.plan), fingerprint(self.plan))


if __name__ == "__main__":
    unittest.main()
