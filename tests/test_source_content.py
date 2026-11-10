"""Guard reconciled source semantics and strictly editorial review boundaries."""

import copy
import json
from pathlib import Path
import unittest

from canopy.knowledge_model import check_views, load
from canopy.source_preparations import project_preparations
from canopy.tools.validate_catalog_reviews import fingerprint, validate_metadata_correction

ROOT = Path(__file__).resolve().parents[1]


class SourceContentTests(unittest.TestCase):
    def test_shared_preparation_index_and_source_evidence(self):
        catalog = json.loads((ROOT / "data/catalog.json").read_text())
        self.assertEqual(catalog["preparations"], project_preparations(ROOT, load()))
        self.assertEqual(len(catalog["preparations"]), 5)
        joint = next(p for p in catalog["preparations"] if len(p["task_refs"]) == 2)
        self.assertEqual(len(joint["plots"]), 6)
        self.assertEqual(joint["points"], 368950419)
        for item in catalog["evidence"]:
            self.assertTrue((ROOT / item["path"]).is_file())
        self.assertGreater(catalog["generated_at"], catalog["observation_snapshot_at"])
        check_views()

    def test_metadata_corrections_cannot_admit_or_redefine_sources(self):
        # Build self-contained data; CI must not depend on the developer's history or temp files.
        source = json.loads((ROOT / "data/catalog.json").read_text())["datasets"][0]
        base = dict(datasets=[source], tasks=[])
        changed = copy.deepcopy(source)
        changed["note"] = "Corrected editorial explanation."
        review = dict(
            dataset_id=source["id"],
            decision="metadata-corrected",
            base_dataset_sha256=fingerprint(source),
            dataset_sha256=fingerprint(changed),
            reviewed_by="Automated editorial test",
            reviewed_at="2026-11-10",
            scope="Editorial only",
            evidence=["report"],
        )
        validate_metadata_correction(changed, source, base, base, review)
        for field, value in [("license", "different"), ("version", "new"), ("cloud_count", 999)]:
            bad = copy.deepcopy(changed)
            bad[field] = value
            review["dataset_sha256"] = fingerprint(bad)
            with self.assertRaises(ValueError):
                validate_metadata_correction(bad, source, base, base, review)
        for mutate in [
            lambda d: d["discovery"]["preparation"].update(status="blocked"),
            lambda d: d["source_task_support"]["species"].update(status="documented"),
            lambda d: d["review"]["observations_snapshot"].update(points=1),
        ]:
            bad = copy.deepcopy(changed)
            mutate(bad)
            review["dataset_sha256"] = fingerprint(bad)
            with self.assertRaises(ValueError):
                validate_metadata_correction(bad, source, base, base, review)
        review["dataset_sha256"] = fingerprint(changed)
        expanded = dict(tasks=[dict(id="new", requirements={"new": True})])
        with self.assertRaises(ValueError):
            validate_metadata_correction(changed, source, expanded, base, review)
        review["base_dataset_sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            validate_metadata_correction(changed, source, base, base, review)
