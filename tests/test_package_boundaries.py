"""Installed imports work without test pollution or import-time application work."""

import os
import re
from urllib.parse import unquote, urlsplit
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PackageBoundaries(unittest.TestCase):
    def environment(self):
        environment = os.environ.copy()
        environment.pop("PYTHONPATH", None)
        return environment

    def test_imports_do_not_load_catalogs_create_state_or_spawn_processes(self):
        code = """
import importlib, pkgutil, pathlib, subprocess
from unittest.mock import patch
import numpy, jsonschema
import canopy
with patch.object(pathlib.Path, 'read_text', side_effect=AssertionError('read on import')), \\
     patch.object(pathlib.Path, 'mkdir', side_effect=AssertionError('mkdir on import')), \\
     patch.object(subprocess, 'run', side_effect=AssertionError('process on import')):
    for module in pkgutil.walk_packages(canopy.__path__, 'canopy.'):
        importlib.import_module(module.name)
"""
        subprocess.run(
            [sys.executable, "-c", code],
            cwd=tempfile.gettempdir(),
            env=self.environment(),
            check=True,
            capture_output=True,
            text=True,
        )

    def test_preparation_status_works_from_a_clean_interpreter_outside_checkout(self):
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                'from canopy.service.app import Service; print(Service().preparation_status()["available"])',
            ],
            cwd=tempfile.gettempdir(),
            env=self.environment(),
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.stdout.strip(), "True")

    def test_supported_service_cli_accepts_its_arguments(self):
        for command in [["-m", "canopy", "service"]]:
            result = subprocess.run(
                [sys.executable, *command, "--help"],
                cwd=tempfile.gettempdir(),
                env=self.environment(),
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIn("--worker", result.stdout)

    def test_moved_guides_have_resolvable_local_links(self):
        files = [ROOT / "README.md", ROOT / "docs/README.md", *(ROOT / "docs").rglob("*.md")]
        for source in files:
            for target in re.findall(r"\]\(([^)]+)\)", source.read_text()):
                parsed = urlsplit(target)
                if parsed.scheme or not parsed.path:
                    continue
                with self.subTest(source=source.name, target=target):
                    self.assertTrue((source.parent / unquote(parsed.path)).exists())

    def test_acquisition_rejects_retired_normalization_option(self):
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "canopy",
                "acquire",
                "--inventory",
                "unused.json",
                "--root",
                "/unused",
                "--stage",
                "/unused-stage",
                "--harmonize",
            ],
            cwd=tempfile.gettempdir(),
            env=self.environment(),
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unrecognized arguments: --harmonize", result.stderr)
