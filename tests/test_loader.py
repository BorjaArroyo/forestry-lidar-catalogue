"""Exercise NumPy loading against the four existing native-source fixtures."""

from pathlib import Path
import subprocess
import sys
import unittest

import numpy as np

from canopy.loader import LoaderConfig, open_dataset
from canopy.task_dataset import export_dataset
import test_task_dataset as dataset_fixtures
import test_classification_package as classification_fixtures


class SegmentationLoader(unittest.TestCase):
    def setUp(self):
        self.fixture = dataset_fixtures.DatasetFolders()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        export_dataset(
            self.fixture.model,
            [self.fixture.fixture.root],
            self.fixture.output,
            profile=self.fixture.fixture.profile,
        )

    def open(self, config=None):
        return open_dataset(
            self.fixture.output,
            config,
            model=self.fixture.model,
            profile=self.fixture.fixture.profile,
        )

    def test_streamed_slices_preserve_native_rows_identity_and_masks(self):
        original = list(self.open())
        dataset = self.open(LoaderConfig(block_points=2, fields=("xyz", "instance")))
        blocks = list(dataset)
        self.assertEqual([b["row_offset"] for b in blocks], [0, 2, 4, 5, 7])
        self.assertTrue(all(len(b["arrays"]["xyz"]) <= 2 for b in blocks))
        for field in ("xyz", "instance", "instance_valid"):
            np.testing.assert_array_equal(
                np.concatenate([b["arrays"][field] for b in blocks]),
                np.concatenate([b["arrays"][field] for b in original]),
            )
        self.assertFalse(blocks[0]["arrays"]["xyz"].flags.writeable)
        self.assertEqual(blocks[0]["arrays"]["instance"].dtype, np.int64)
        self.assertEqual({b["source_ref"] for b in blocks}, {"zenodo:8287792"})

    def test_unknown_filters_and_invalid_limits_fail_explicitly(self):
        for config in (
            LoaderConfig(partitions=("train",)),
            LoaderConfig(sources=("unknown",)),
            LoaderConfig(fields=("typo",)),
            LoaderConfig(modalities=("TLS",)),
        ):
            with self.assertRaisesRegex(ValueError, "Unavailable"):
                self.open(config)
        for options in (
            {"block_points": 0},
            {"block_points": True},
            {"partitions": "dev"},
            {"fields": ()},
            {"copy_arrays": "yes"},
        ):
            with self.assertRaises(ValueError):
                LoaderConfig(**options)

    def test_writable_copies_do_not_change_later_reads(self):
        first = next(iter(self.open(LoaderConfig(copy_arrays=True))))
        expected = first["arrays"]["xyz"].copy()
        first["arrays"]["xyz"][:] = 0
        np.testing.assert_array_equal(next(iter(self.open()))["arrays"]["xyz"], expected)

    def test_changed_index_and_corrupt_payload_are_rejected(self):
        dataset = self.open()
        dataset.validate()
        path = self.fixture.output / "dataset.json"
        original = path.read_bytes()
        path.write_bytes(original + b" ")
        with self.assertRaisesRegex(ValueError, "metadata changed"):
            next(iter(dataset))
        path.write_bytes(original)
        next(self.fixture.output.rglob("*.npz")).write_bytes(b"corrupted")
        with self.assertRaises(ValueError):
            next(iter(self.open()))


class MixedSourceLoader(unittest.TestCase):
    def setUp(self):
        self.fixture = dataset_fixtures.MixedDatasetFolders()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        export_dataset(
            self.fixture.model,
            [self.fixture.native.root, self.fixture.fgi.output],
            self.fixture.output,
            variables={"reflectance": "optional"},
        )

    def test_mixed_sources_keep_partitions_and_optional_spectral_masks(self):
        dataset = open_dataset(self.fixture.output)
        self.assertEqual(dataset.info["partitions"], ["dev", "train"])
        blocks = list(dataset)
        mono = next(b for b in blocks if b["source_ref"] == "zenodo:8287792")
        multi = next(b for b in blocks if b["source_ref"] == "zenodo:19351234")
        self.assertNotIn("features", mono["arrays"])
        self.assertIn("feature_valid", multi["arrays"])
        filtered = list(
            open_dataset(
                self.fixture.output,
                LoaderConfig(sources=("zenodo:19351234",), fields=("features",)),
            )
        )
        self.assertTrue(filtered)
        self.assertTrue(all(set(b["arrays"]) == {"features", "feature_valid"} for b in filtered))
        self.assertTrue(all(b["published_split"] == "train" for b in filtered))

    def test_filters_cannot_hide_corrupt_unselected_sources(self):
        next((self.fixture.output / "dev").rglob("*.npz")).write_bytes(b"corrupt")
        dataset = open_dataset(self.fixture.output, LoaderConfig(partitions=("train",)))
        with self.assertRaises(ValueError):
            next(iter(dataset))


class ClassificationLoader(unittest.TestCase):
    def setUp(self):
        self.fixture = classification_fixtures.ClassificationPackageTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def test_both_sources_keep_rank_validity_and_sensor_observation_identity(self):
        dataset = open_dataset(self.fixture.output, LoaderConfig(block_points=2))
        blocks = list(dataset)
        self.assertEqual(set(dataset.info["sources"]), {"zenodo:13255198", "grodata:128035:1.0"})
        partial = [b for b in blocks if b["tree_id"] == "B2"]
        self.assertEqual({b["modality"] for b in partial}, {"TLS", "ULS"})
        self.assertTrue(all(b["taxonomy"]["species"] is None for b in partial))
        self.assertTrue(
            all(b["reference_valid"] == {"genus": True, "species": False} for b in partial)
        )
        self.assertTrue(all(b["arrays"]["xyz"].dtype == np.float64 for b in blocks))
        partial[0]["taxonomy"]["genus"] = None
        self.assertIsNotNone(next(b for b in dataset if b["tree_id"] == "B2")["taxonomy"]["genus"])

    def test_filters_preserve_existing_partitions_and_modalities(self):
        dataset = open_dataset(
            self.fixture.output,
            LoaderConfig(
                sources=("grodata:128035:1.0",),
                modalities=("TLS",),
                partitions=("train",),
            ),
        )
        blocks = list(dataset)
        self.assertTrue(blocks)
        self.assertTrue(
            all(
                b["source_ref"] == "grodata:128035:1.0"
                and b["modality"] == "TLS"
                and b["published_split"] == "train"
                for b in blocks
            )
        )

    def test_example_runs_from_outside_the_checkout_without_ml_frameworks(self):
        example = Path(__file__).resolve().parents[1] / "examples/load_dataset.py"
        result = subprocess.run(
            [sys.executable, str(example), str(self.fixture.output), "--block-points", "2"],
            cwd=self.fixture.root,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("float64", result.stdout)
        self.assertIn("observation_id", result.stdout)

    def test_changed_vocabulary_requires_reopening(self):
        dataset = open_dataset(self.fixture.output)
        dataset.validate()
        path = self.fixture.output / "vocabulary.json"
        path.write_bytes(path.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "metadata changed"):
            next(iter(dataset))
