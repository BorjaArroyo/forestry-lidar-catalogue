"""Small native archives exercise auditing and safe checkpoint reuse offline."""

from canopy.classification.dataio import read_json

import hashlib
import copy
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
import zipfile
from unittest.mock import patch

import laspy
import numpy as np
import zstandard


from canopy.classification.audit import audit_archive, main as audit_main
from canopy.classification.complete_audit import reconcile
from canopy.classification.snapshot import FOR, BIODIV
from test_classification import fixture_context

ROOT = Path(__file__).resolve().parents[1]


class NativeAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        cloud = laspy.LasData(laspy.LasHeader(point_format=3, version="1.2"))
        cloud.X = np.array([-17, 0, 23], dtype=np.int32)
        cloud.Y = cloud.X + 100
        cloud.Z = cloud.X - 21
        cloud.intensity = [1, 2, 65535]
        cloud.write(self.root / "1.laz")
        self.data = (self.root / "1.laz").read_bytes()
        self.trees = {
            (FOR, "1"): dict(
                modalities=["TLS"],
                published_split="dev",
                collection="native-test",
                reference_valid={"species": True, "genus": True},
            )
        }

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, members):
        path = self.root / "dev.zip"
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as stream:
            for name, data in members:
                stream.writestr(name, data)
        data = path.read_bytes()
        return path, dict(
            name="dev.zip", size_bytes=len(data), checksum="md5:" + hashlib.md5(data).hexdigest()
        )

    def test_nested_alias_is_not_an_extra_observation_and_resume_is_exact(self):
        nested = io.BytesIO()
        with zipfile.ZipFile(nested, "w") as stream:
            stream.writestr("train/1.laz", self.data)
        path, asset = self.archive([("dev/1.laz", self.data), ("train.zip", nested.getvalue())])
        first = audit_archive(path, FOR, asset, self.trees, self.root / "stage")
        self.assertEqual(len(first["observations"]), 1)
        self.assertEqual(first["observations"][0]["points"], 3)
        self.assertEqual(
            first["nested_aliases"][0]["sha256"], hashlib.sha256(self.data).hexdigest()
        )
        checkpoint = self.root / "stage/observations.jsonl"
        with checkpoint.open("ab") as stream:
            stream.write(b'{"interrupted":')
        second = audit_archive(path, FOR, asset, self.trees, self.root / "stage")
        self.assertEqual(json.loads(json.dumps(first["observations"])), second["observations"])
        self.assertEqual(len(checkpoint.read_text().splitlines()), 1)
        self.assertFalse((self.root / "stage/cloud").exists())
        self.assertFalse((self.root / "stage/nested.zip").exists())

    def test_provider_corruption_and_checkpoint_contract_changes_fail(self):
        path, asset = self.archive([("1.laz", self.data)])
        audit_archive(path, FOR, asset, self.trees, self.root / "stage")
        with self.assertRaisesRegex(ValueError, "ARCHIVE_CHECKSUM_MISMATCH"):
            audit_archive(
                path, FOR, dict(asset, checksum="md5:" + "0" * 32), self.trees, self.root / "other"
            )
        contract = self.root / "stage/audit-input.json"
        value = read_json(contract)
        value["implementation_sha256"] = "0" * 64
        contract.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "AUDIT_CHECKPOINT_CHANGED"):
            audit_archive(path, FOR, asset, self.trees, self.root / "stage")

    def test_unsafe_members_and_unmatched_nested_clouds_fail(self):
        path, asset = self.archive([("../1.laz", self.data)])
        with self.assertRaisesRegex(ValueError, "UNSAFE_PATH"):
            audit_archive(path, FOR, asset, self.trees, self.root / "unsafe")
        nested = io.BytesIO()
        with zipfile.ZipFile(nested, "w") as stream:
            stream.writestr("2.laz", self.data)
        path, asset = self.archive([("1.laz", self.data), ("train.zip", nested.getvalue())])
        with self.assertRaisesRegex(ValueError, "CLOUD_WITHOUT_LABEL_ROW"):
            audit_archive(path, FOR, asset, self.trees, self.root / "unmatched")

    def test_provider_cli_keeps_archive_checkpoints_separate(self):
        assets = []
        paths = []
        for mode in ["TLS", "ULS"]:
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode="w", format=tarfile.USTAR_FORMAT) as stream:
                member = tarfile.TarInfo(mode + "/B1_" + mode + ".laz")
                member.size = len(self.data)
                stream.addfile(member, io.BytesIO(self.data))
            data = zstandard.ZstdCompressor().compress(buffer.getvalue())
            path = self.root / (mode + ".tar.zst")
            path.write_bytes(data)
            paths.append(path)
            assets.append(
                dict(
                    name=path.name,
                    size_bytes=len(data),
                    checksum="md5:" + hashlib.md5(data).hexdigest(),
                )
            )
        tree = dict(
            source_ref=BIODIV,
            tree_id="B1",
            published_split="train",
            collection="test-plot",
            modalities=[],
        )
        registry = dict(sources=[dict(source_ref=BIODIV, assets=assets)])
        argv = [
            "audit",
            "--source",
            BIODIV,
            "--output",
            str(self.root / "report.json"),
            "--staging",
            str(self.root / "cli-stage"),
        ]
        for path in paths:
            argv.extend(["--archive", str(path)])
        with (
            patch.object(sys, "argv", argv),
            patch("canopy.classification.model.load_registry", return_value=(registry, {}, [tree])),
        ):
            audit_main()
        reports = read_json(self.root / "report.json")["archives"]
        self.assertEqual([r["archive"] for r in reports], ["TLS.tar.zst", "ULS.tar.zst"])
        self.assertEqual(sum(len(r["observations"]) for r in reports), 2)


class FullReconciliationTests(unittest.TestCase):
    def reports(self):
        registry, vocabulary, trees = fixture_context()
        reports = {}
        for source in registry["sources"]:
            for o in source["observations"]:
                o["native_schema"] = {"fields": [["X", "<i4"], ["Y", "<i4"], ["Z", "<i4"]]}
                o["point_format"] = 0
                report = reports.setdefault(
                    o["archive"],
                    dict(
                        archive=o["archive"],
                        status="native-audited",
                        provider_checksum_verified=True,
                        sha256="1" * 64,
                        implementation_sha256="2" * 64,
                        observations=[],
                        nested_aliases=[],
                    ),
                )
                report["observations"].append(o)
        return registry, trees, reports

    def test_complete_views_and_splits_are_reconciled(self):
        registry, trees, reports = self.reports()
        observations, summary = reconcile(registry, trees, reports)
        self.assertEqual(summary["totals"], dict(trees=6, observations=10, points=30))
        self.assertEqual(summary["sources"]["grodata:128035:1.0"]["paired_tls_uls"], 4)

    def test_missing_archive_or_sensor_and_relabelled_members_fail(self):
        registry, trees, reports = self.reports()
        missing = copy.deepcopy(reports)
        missing.pop("dev.zip")
        with self.assertRaisesRegex(ValueError, "COMPLETE_ARCHIVE_SET_REQUIRED"):
            reconcile(registry, trees, missing)
        missing = copy.deepcopy(reports)
        missing["ULS.tar.zst"]["observations"].pop()
        with self.assertRaisesRegex(ValueError, "MISSING_OR_DUPLICATED_SENSOR"):
            reconcile(registry, trees, missing)
        reports["TLS.tar.zst"]["observations"][0]["published_split"] = "test"
        with self.assertRaisesRegex(ValueError, "NATIVE_MEMBERSHIP_CHANGED"):
            reconcile(registry, trees, reports)

    def test_nested_alias_must_be_byte_identical(self):
        registry, trees, reports = self.reports()
        dev = reports["dev.zip"]
        original = dev["observations"][0]
        dev["nested_aliases"] = [dict(alias_of=original["observation_id"], sha256="f" * 64)]
        with self.assertRaisesRegex(ValueError, "NESTED_ALIAS_NOT_BYTE_IDENTICAL"):
            reconcile(registry, trees, reports)


if __name__ == "__main__":
    unittest.main()
