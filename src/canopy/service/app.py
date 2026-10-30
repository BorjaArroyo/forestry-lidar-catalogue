"""Per-process dependencies and API operations for the local Canopy service."""

import re
import secrets
import threading

from .config import ServiceConfig
from .jobs import inspect_jobs
from .http import create_handler
from .storage import RequestError, directory, now, read, save, sha


class Service:
    """Own configuration and mutable state without import-time initialization."""

    def __init__(self, config=None):
        self.config = config or ServiceConfig()
        self.REPO = self.config.repo
        self.WEB = self.config.web
        self.INSTANCE_PACKAGE = self.config.instance_package
        self.STATE_ROOT = self.config.state_root
        self.STATE = self.STATE_ROOT / "canopy-workbench"
        self.TOKEN = secrets.token_urlsafe(32)
        self.GUARD = threading.Lock()
        self.ACTIVE = {"queued", "running"}
        self.Handler = create_handler(self)

    now = staticmethod(now)
    read = staticmethod(read)
    save = staticmethod(save)
    sha = staticmethod(sha)

    def directory(self, value, exists=True):
        return directory(value, exists=exists, repo=self.REPO)

    def public_files(self):
        """Return the published-file manifest, loaded once per service process."""
        cached = getattr(self, "_public_files", None)
        if cached is None:
            cached = self.read(self.WEB / "publication-manifest.json")["files"]
            self._public_files = cached
        return cached

    def records(self):
        return self.read(self.REPO / "docs/lidar-acquisition-inventory.json")["records"]

    def inspect_record(self, value):
        match = re.fullmatch(r"(?:https://zenodo.org/records/)?([1-9][0-9]*)/?", str(value).strip())
        if not match:
            raise RequestError("Enter a numeric Zenodo record ID or its record URL")
        rid = int(match[1])
        record = next((r for r in self.records() if r["record_id"] == rid), None)
        if record is None:
            raise RequestError(
                "Record is outside the reviewed inventory; source admission requires prior analysis"
            )
        if not record["files"]:
            raise RequestError("Record has no downloadable files")
        self.save(self.STATE / "records" / f"{rid}.json", record)
        return record

    def preparation_status(self):
        from ..preparation_profile import status

        return status(self.INSTANCE_PACKAGE, self.WEB)

    def preparation_destination(self, root, output, fingerprint):
        if root == output or output.is_relative_to(root) or root.is_relative_to(output):
            raise RequestError("Prepared output must be separate from original-source directories")
        if output.exists():
            marker = output / "task-package.json"
            marker = marker if marker.exists() else output / ".incomplete.json"
            if not marker.exists() or self.read(marker).get("package_sha256") != fingerprint:
                raise RequestError("Existing output is not a matching resumable instance package")

    def preparation_input(self, root, output):
        from ..preparation_profile import validate_input

        return validate_input(
            root,
            output,
            self.INSTANCE_PACKAGE,
            self.preparation_status(),
            self.preparation_destination,
        )

    def jobs(self):
        return inspect_jobs(self.STATE, self.read)

    def submit(self, body):
        from .jobs import submit as submit_job

        return submit_job(self, body)

    def launch_worker(self, folder):
        from .jobs import launch_worker as launch

        return launch(self, folder)

    def job_path(self, jid):
        from .jobs import job_path as path_for_job

        return path_for_job(self, jid)

    def worker(self, folder):
        from .jobs import worker as run_worker

        return run_worker(self, folder)
