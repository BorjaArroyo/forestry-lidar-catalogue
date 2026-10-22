"""Inspect, admit, launch, and execute durable service jobs."""

import hashlib
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

from .storage import RequestError


def inspect_jobs(state, read):
    """Load job records and mark workers that disappeared without final state."""
    result = []
    for path in sorted((Path(state) / "jobs").glob("*/job.json"), reverse=True):
        job = read(path)
        if job.get("backend") == "ray":
            result.append(job)
            continue
        pid_file = path.parent / "worker.pid"
        if not job.get("pid") and pid_file.exists():
            job["pid"] = int(pid_file.read_text())
        if job.get("pid"):
            try:
                stopped, _ = os.waitpid(job["pid"], os.WNOHANG)
                if stopped:
                    job = read(path)
            except ChildProcessError:
                pass
        if job["status"] in {"queued", "running"} and job.get("pid"):
            try:
                os.kill(job["pid"], 0)
            except ProcessLookupError:
                job["status"] = "interrupted"
                job["error"] = (
                    "Worker stopped without recording completion; inspect logs before resuming"
                )
        result.append(job)
    return result


def submit(api, body):
    from filelock import FileLock

    if not isinstance(body, dict) or not isinstance(body.get("kind"), str):
        raise RequestError("Invalid job kind")
    kind = body.get("kind")
    allowed = (
        {"kind", "record_id", "root", "output", "task_request"}
        if kind == "prepare-instances"
        else {"kind", "record_id", "root", "prepare_output", "task_request"}
    )
    if kind not in {"acquire", "prepare-instances"} or set(body) - allowed:
        raise RequestError(
            "Only original-source acquisition and the audited FOR-instance preparation are available"
        )
    if not isinstance(body, dict) or "record_id" not in body:
        raise RequestError("A job requires a record_id")
    if isinstance(body["record_id"], bool) or not re.fullmatch(
        r"[1-9][0-9]*", str(body["record_id"])
    ):
        raise RequestError("Invalid record_id")
    for key in ("root", "output", "prepare_output"):
        if key in body and not isinstance(body[key], str):
            raise RequestError(f"{key} must be a directory string")
    task_plan = None
    if "task_request" in body:
        from ..knowledge_model import load
        from ..task_plan import plan_request, check_plan

        request = body["task_request"]
        if not isinstance(request, dict) or set(request) - {"use", "variables"}:
            raise RequestError("Invalid task request")
        if kind != "prepare-instances" and not body.get("prepare_output"):
            raise RequestError("A task request requires audited preparation, not only acquisition")
        if not isinstance(request.get("use", "training"), str) or not isinstance(
            request.get("variables", {}), dict
        ):
            raise RequestError("Invalid task request")
        model = load(api.WEB / "knowledge-model.json")
        try:
            task_plan = plan_request(
                model, body["record_id"], request.get("use", "training"), request.get("variables")
            )
            check_plan(model, task_plan)
        except ValueError as error:
            raise RequestError(str(error)) from error
    root = api.directory(body.get("root", ""), exists=kind == "prepare-instances")
    with api.GUARD, FileLock(str(api.STATE / "submission.lock"), timeout=0):
        if any(j["status"] in api.ACTIVE for j in api.jobs()):
            raise RequestError("A Canopy job is already active. Wait for it to finish.")
        job_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + secrets.token_hex(4)
        folder = api.STATE / "jobs" / job_id
        job = {
            "id": job_id,
            "kind": kind,
            "root": str(root),
            "status": "queued",
            "created_at": api.now(),
        }
        rid = int(body["record_id"])
        if kind == "prepare-instances" or body.get("prepare_output"):
            from ..preparation_profile import require_record

            try:
                require_record(rid)
            except ValueError as error:
                raise RequestError(str(error)) from error
        job["record_id"] = rid
        if task_plan is not None:
            job["task_plan"] = task_plan
            job["task_plan_validator_sha256"] = api.sha(api.REPO / "src/canopy/task_plan.py")
        if kind == "prepare-instances":
            output = api.directory(body.get("output", ""), exists=False)
            try:
                ready = api.preparation_input(root, output)
            except ValueError as error:
                raise RequestError(str(error)) from error
            job.update(output=str(output), package_sha256=ready["package_sha256"])
        else:
            record = api.inspect_record(rid)
            inv = {"records": [record]}
            if (root / "inventory.json").exists():
                inv = api.read(root / "inventory.json")
                if [r["record_id"] for r in inv["records"]] != [rid]:
                    raise RequestError(
                        "Destination belongs to another inventory. Select a new record directory."
                    )
                if inv["records"][0]["files"] != record["files"]:
                    raise RequestError(
                        "Pinned asset inventory differs from destination; inspect before resuming"
                    )
            elif root.exists() and any(root.iterdir()):
                raise RequestError(
                    "Choose an empty destination or a matching acquisition directory"
                )
            parent = root
            while not parent.exists():
                parent = parent.parent
            total = sum(f["size_bytes"] for f in record["files"])
            if shutil.disk_usage(parent).free < total:
                raise RequestError("Insufficient destination space even for compressed assets")
            job["expected_bytes"] = total
            job["record_id"] = rid
            api.save(folder / "inventory.json", inv)
            if body.get("prepare_output"):
                output = api.directory(body["prepare_output"], exists=False)
                ready = api.preparation_status()
                api.preparation_destination(root, output, ready["package_sha256"])
                job.update(output=str(output), package_sha256=ready["package_sha256"])
        api.save(folder / "job.json", job)
        pid = api.launch_worker(folder)
        return {"id": job_id, "pid": pid}


def launch_worker(api, folder):
    # posix_spawn avoids forking the multithreaded macOS HTTP process after NumPy loads.
    command = [sys.executable, "-m", "canopy.service.cli", "--worker", str(folder)]
    try:
        with (folder / "worker.log").open("ab") as log:
            pid = os.posix_spawn(
                sys.executable,
                command,
                os.environ,
                file_actions=[
                    (os.POSIX_SPAWN_OPEN, 0, "/dev/null", os.O_RDONLY, 0),
                    (os.POSIX_SPAWN_DUP2, log.fileno(), 1),
                    (os.POSIX_SPAWN_DUP2, log.fileno(), 2),
                ],
                setsid=True,
            )
        (folder / "worker.pid").write_text(str(pid))
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            current = api.read(folder / "job.json")
            if current["status"] != "queued":
                return pid
            stopped, status = os.waitpid(pid, os.WNOHANG)
            if stopped:
                raise RequestError(
                    f"Worker stopped during startup (exit {os.waitstatus_to_exitcode(status)}); inspect its log"
                )
            time.sleep(0.02)
        return pid
    except (OSError, ValueError) as error:
        current = api.read(folder / "job.json")
        current.update(status="failed", error=str(error), finished_at=api.now())
        api.save(folder / "job.json", current)
        raise


def job_path(api, jid):
    if not re.fullmatch(r"[0-9T]+-[a-f0-9]{8}", jid):
        raise RequestError("Invalid job ID")
    return api.STATE / "jobs" / jid / "job.json"


def worker(api, folder):
    job = api.read(folder / "job.json")
    job.update(status="running", phase="starting", pid=os.getpid(), started_at=api.now())
    api.save(folder / "job.json", job)
    try:
        root = Path(job["root"])
        task_model = None
        if "task_plan" in job:
            from ..knowledge_model import load
            from ..task_plan import check_plan

            if api.sha(api.REPO / "src/canopy/task_plan.py") != job["task_plan_validator_sha256"]:
                raise RequestError("Task request validator changed after submission")
            task_model = load(api.WEB / "knowledge-model.json")
            check_plan(task_model, job["task_plan"])
        if job["kind"] not in {"acquire", "prepare-instances"}:
            raise RequestError("Unsupported job type")
        if job["kind"] == "acquire":
            # Staging, locks and the acquisition index stay colocated with the
            # state root that owns this job (folder = ROOT/canopy-workbench/jobs/<id>),
            # so a relocated root moves them together in the worker process too.
            state_root = folder.parents[2]
            command = [
                sys.executable,
                str(api.REPO / "scripts/acquire_lidar.py"),
                "--inventory",
                str(folder / "inventory.json"),
                "--root",
                str(root),
                "--stage",
                str(
                    state_root
                    / ("canopy-stage-" + hashlib.sha256(str(root).encode()).hexdigest()[:16])
                ),
                "--resume",
            ]
            job["phase"] = "downloading"
            job["command"] = command
            api.save(folder / "job.json", job)
            subprocess.run(command, check=True)
        if "output" in job:
            status = api.preparation_status()
            if status["package_sha256"] != job["package_sha256"]:
                raise RequestError("Pipeline changed after submission; inspect before resuming")
            from ..preparation_profile import command as preparation_command, open_package

            command = preparation_command(sys.executable, api.INSTANCE_PACKAGE, root, job["output"])
            job["phase"] = "preparing"
            job["preparation_command"] = command
            api.save(folder / "job.json", job)
            subprocess.run(command, check=True)
            job["phase"] = "validating"
            api.save(folder / "job.json", job)
            prepared = open_package(job["output"], api.INSTANCE_PACKAGE)
            if task_model is not None:
                from ..task_plan import validate_prepared

                task_report = validate_prepared(task_model, job["task_plan"], prepared)
                report = {**task_report["package"], "task_request": task_report}
                api.save(Path(job["output"]) / "task-plan.json", job["task_plan"])
                api.save(Path(job["output"]) / "task-validation.json", task_report)
            else:
                report = prepared.validate()
            package = prepared.manifest
            report.update(
                unmatched_split_rows=len(package["unmatched_split_rows"]),
                geographic_independence=package["geographic_independence"],
            )
            api.save(folder / "task-package-report.json", report)
            job["validation_report_sha256"] = api.sha(folder / "task-package-report.json")
        job["status"] = "completed"
        job["phase"] = "completed"
    except Exception as exc:
        job.update(status="failed", error=str(exc))
        print(f"FAILED: {exc}", flush=True)
    job["finished_at"] = api.now()
    api.save(folder / "job.json", job)
