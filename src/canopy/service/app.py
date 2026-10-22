"""Loopback-only Canopy service and durable background job worker."""

import argparse
from pathlib import Path
import re
import secrets
import sys
import threading
from http.server import ThreadingHTTPServer

from .config import INSTANCE_PACKAGE, REPO, WEB, state_root
from .jobs import inspect_jobs
from .http import create_handler
from .storage import directory, now, read, save, sha  # noqa: F401


STATE_ROOT = state_root()
STATE = STATE_ROOT / "canopy-workbench"
TOKEN = secrets.token_urlsafe(32)
GUARD = threading.Lock()
ACTIVE = {"queued", "running", "cancelling"}
Handler = create_handler(sys.modules[__name__])


def records():
    return read(REPO / "docs/lidar-acquisition-inventory.json")["records"]


def inspect_record(value):
    match = re.fullmatch(r"(?:https://zenodo.org/records/)?([1-9][0-9]*)/?", str(value).strip())
    if not match:
        raise ValueError("Enter a numeric Zenodo record ID or its record URL")
    rid = int(match[1])
    record = next((r for r in records() if r["record_id"] == rid), None)
    if record is None:
        raise ValueError(
            "Record is outside the reviewed inventory; source admission requires prior analysis"
        )
    if not record["files"]:
        raise ValueError("Record has no downloadable files")
    save(STATE / "records" / f"{rid}.json", record)
    return record


def preparation_status():
    from ..preparation_profile import status

    return status(INSTANCE_PACKAGE, WEB)


def preparation_destination(root, output, fingerprint):
    if root == output or output.is_relative_to(root) or root.is_relative_to(output):
        raise ValueError("Prepared output must be separate from original-source directories")
    if output.exists():
        marker = output / "task-package.json"
        marker = marker if marker.exists() else output / ".incomplete.json"
        if not marker.exists() or read(marker).get("package_sha256") != fingerprint:
            raise ValueError("Existing output is not a matching resumable instance package")


def preparation_input(root, output):
    from ..preparation_profile import validate_input

    return validate_input(
        root, output, INSTANCE_PACKAGE, preparation_status(), preparation_destination
    )


def jobs():
    return inspect_jobs(STATE, read)


def submit(body):
    from .jobs import submit as submit_job

    return submit_job(sys.modules[__name__], body)


def launch_worker(folder):
    from .jobs import launch_worker as launch

    return launch(sys.modules[__name__], folder)


def job_path(jid):
    from .jobs import job_path as path_for_job

    return path_for_job(sys.modules[__name__], jid)


def worker(folder):
    from .jobs import worker as run_worker

    return run_worker(sys.modules[__name__], folder)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--worker", type=Path)
    args = parser.parse_args()
    if args.worker:
        worker(args.worker)
    else:
        STATE.mkdir(parents=True, exist_ok=True)
        print(f"Canopy workbench: http://127.0.0.1:{args.port}", flush=True)
        ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
