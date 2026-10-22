"""Admission regression checks, without network access."""

import copy
import json
import tempfile
import unittest
from pathlib import Path
from canopy.tools.validate_catalog_reviews import fingerprint, validate


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.reviews = Path(self.directory.name)
        self.catalog = {"datasets": [{"id": "1", "title": "Source"}], "tasks": [{"id": "geometry"}]}
        self.base = {"datasets": []}
        self.review = {
            "dataset_id": "1",
            "dataset_sha256": fingerprint(self.catalog["datasets"][0]),
            "decision": "admitted",
            "reviewed_by": "Maintainer",
            "reviewed_at": "2026-01-01",
            "proposal_url": "https://example.org/proposal",
            "scope": "Geometry",
            "limitations": "No labels",
            "analysis": {
                k: {"finding": "Checked", "evidence": ["report.json"]}
                for k in ("provenance", "rights", "integrity", "schema", "coverage", "duplicates")
            },
            "tasks": {
                "geometry": {
                    "status": "conditional",
                    "rationale": "Units need validation",
                    "evidence": ["report.json"],
                }
            },
        }

    def save(self):
        (self.reviews / "1.json").write_text(json.dumps(self.review))

    def test_unchanged_legacy(self):
        self.assertEqual(validate(self.catalog, self.catalog, self.reviews), 0)

    def test_missing_review(self):
        with self.assertRaises(FileNotFoundError):
            validate(self.catalog, self.base, self.reviews)

    def test_admitted(self):
        self.save()
        self.assertEqual(validate(self.catalog, self.base, self.reviews), 1)

    def test_stale_review(self):
        self.save()
        self.catalog["datasets"][0]["title"] = "Changed"
        with self.assertRaises(ValueError):
            validate(self.catalog, self.base, self.reviews)

    def test_incomplete_or_draft_review(self):
        for field, value in (
            ("decision", "draft"),
            ("tasks", {}),
            ("analysis", {}),
            ("reviewed_by", ""),
        ):
            original = copy.deepcopy(self.review)
            self.review[field] = value
            self.save()
            with self.assertRaises(ValueError):
                validate(self.catalog, self.base, self.reviews)
            self.review = original


if __name__ == "__main__":
    unittest.main()
