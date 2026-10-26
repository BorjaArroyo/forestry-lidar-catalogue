"""Acquisition reuse must validate the durable bytes, including on resume."""

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

from canopy.tools import acquire


class AcquisitionTests(unittest.TestCase):
    def test_resume_revalidates_stored_files_and_archive_members(self):
        for archive in (False, True):
            for damage in ("missing", "same-size corruption"):
                with self.subTest(archive=archive, damage=damage), TemporaryDirectory() as temp:
                    base = Path(temp)
                    stage = base / "stage"
                    stage.mkdir()
                    name = "fixture.zip" if archive else "fixture.bin"
                    staged = stage / ("123_" + name)
                    if archive:
                        with zipfile.ZipFile(staged, "w") as output:
                            output.writestr("tree.bin", b"original-data")
                    else:
                        staged.write_bytes(b"original-data")
                    asset = dict(
                        name=name,
                        size_bytes=staged.stat().st_size,
                        provider_checksum="md5:" + hashlib.md5(staged.read_bytes()).hexdigest(),
                        download_url="https://example.invalid/fixture",
                    )
                    inventory = base / "inventory.json"
                    inventory.write_text(
                        json.dumps({"records": [dict(record_id=123, files=[asset])]})
                    )
                    args = SimpleNamespace(
                        root=base / "output",
                        stage=stage,
                        inventory=inventory,
                        max_asset_bytes=None,
                        resume=False,
                    )
                    acquire.run(args)
                    marker = args.root / "sources/123/manifests" / (name + ".json")
                    stored = args.root / json.loads(marker.read_text())["outputs"][0]["path"]
                    args.resume = True
                    with patch.object(
                        acquire, "download_asset", side_effect=AssertionError("Unexpected download")
                    ):
                        acquire.run(args)
                    status = json.loads((args.root / "acquisition-status.json").read_text())
                    self.assertEqual(len(status["completed"]), 1)
                    if damage == "missing":
                        stored.unlink()
                    else:
                        stored.write_bytes(b"X" * stored.stat().st_size)
                    with self.assertRaisesRegex(ValueError, "missing or changed"):
                        acquire.verified_marker(marker, asset, args.root)
                    with patch.object(acquire.time, "sleep"), self.assertRaises(RuntimeError):
                        acquire.run(args)
                    status = json.loads((args.root / "acquisition-status.json").read_text())
                    self.assertEqual(status["completed"], [])
                    self.assertEqual(len(status["errors"]), 1)
                    self.assertNotIn("finished_at", status)


if __name__ == "__main__":
    unittest.main()
