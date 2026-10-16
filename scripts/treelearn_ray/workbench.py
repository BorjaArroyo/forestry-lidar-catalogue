"""Narrow KubeRay adapter for the audited frozen Wytham workflow."""
import base64
import hashlib
import time
import json
from pathlib import Path
import re
import subprocess

from .render_job import render

RECIPE = "treelearn-wytham-ray"
IMAGE = "ghcr.io/borjaarroyo/canopy-treelearn-ray@sha256:bfe3194d979cec051fadb104ee817571614cc66172347a5eed1a5aa56e7fd6ac"
COMMIT = "fd240ce7caa4c444fe3418aca454dc578bc557d4"
INPUT_SHA = "f0405d94b303862ff82fb0472785bf0cffaa60d4bd58bec6fbb92f21e0f55883"
CHECKPOINT_SHA = "eb01b97061047783989ea0c311f1ef6eaa2f8423b422ce0620b69e136c5cebf9"
FILES = ("result.json", "coverage.json", "metrics-summary.json", "partition-policy.json",
         "pipeline-config.yaml", "evaluation-config.yaml", "instance-predictions.npy",
         "failure.txt", "evaluator.log", "documentation/log_pipeline.txt")
ACTIVE = {"queued", "running", "cancelling"}


def profile(state):
    path = state / "ray-profile.json"
    if not path.is_file():
        raise ValueError("Configure temp/canopy-workbench/ray-profile.json on the service host first")
    value = json.loads(path.read_text())
    if set(value) != {"context", "namespace", "pvc", "reader_cluster", "input_dir", "output_base"}:
        raise ValueError("Invalid Ray deployment profile fields")
    for key in ("context", "namespace", "pvc", "reader_cluster"):
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}", value[key]):
            raise ValueError(f"Invalid deployment identifier: {key}")
    for key in ("input_dir", "output_base"):
        p = Path(value[key])
        if ".." in p.parts or not p.is_relative_to("/mnt/storage/forestseg/runs") or p == Path("/mnt/storage/forestseg/runs"):
            raise ValueError(f"Invalid PVC directory: {key}")
    return value


def command(p, *args):
    return ["kubectl", "--context", p["context"], "--request-timeout=15s", "-n", p["namespace"], *args]


def call(p, *args, payload=None):
    result = subprocess.run(command(p, *args), input=payload, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise ValueError((result.stderr or "kubectl failed")[-2000:].strip())
    return result.stdout


def reader(p):
    pods = json.loads(call(p, "get", "pods", "-l", f'ray.io/cluster={p["reader_cluster"]},ray.io/node-type=head', "-o", "json"))["items"]
    ready = [pod for pod in pods if pod.get("status", {}).get("phase") == "Running"
             and any(c.get("type") == "Ready" and c.get("status") == "True" for c in pod["status"].get("conditions", []))
             and any(v.get("persistentVolumeClaim", {}).get("claimName") == p["pvc"] for v in pod["spec"].get("volumes", []))]
    if len(ready) != 1:
        raise ValueError("A ready persistent Ray head mounting the configured PVC is required for read-back")
    return ready[0]["metadata"]["name"]


# This script only reads allowlisted files. Resolve every path against its PVC root,
# including symlinks, before opening it. Binary payloads never enter JSON responses.
READ = '''import json, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
assert root.is_relative_to('/mnt/storage/forestseg/runs')
names = json.loads(sys.argv[2])
mode = sys.argv[3]
def checked(name):
    p = (root / name).resolve()
    assert p.is_relative_to(root) and p != root, 'Artifact escapes output directory'
    return p
if mode in ('stat', 'chunk'):
    import base64, hashlib
    p = checked(names[0])
    size = p.stat().st_size
    assert p.is_file() and size <= 2 * 1024**3
    if mode == 'stat':
        digest = hashlib.sha256()
        with p.open('rb') as f:
            for block in iter(lambda: f.read(1024**2), b''):
                digest.update(block)
        print(json.dumps({'size_bytes': size, 'sha256': digest.hexdigest()}))
    else:
        offset, count = int(sys.argv[4]), int(sys.argv[5])
        assert 0 <= offset < size and 0 < count <= 4 * 1024**2
        with p.open('rb') as f:
            f.seek(offset)
            block = f.read(count)
        print(json.dumps({'offset': offset, 'size_bytes': size,
                          'sha256': hashlib.sha256(block).hexdigest(),
                          'data': base64.b64encode(block).decode('ascii')}))
else:
    result = {'files': [], 'reports': {}, 'log': ''}
    for name in names:
        p = checked(name)
        if p.is_file():
            result['files'].append({'name': name, 'size_bytes': p.stat().st_size})
            if name.endswith('.json') and p.stat().st_size < 1024**2:
                result['reports'][name] = json.loads(p.read_text())
            if name in ('failure.txt', 'documentation/log_pipeline.txt'):
                with p.open('rb') as f:
                    f.seek(max(0, p.stat().st_size - 32000))
                    result['log'] += f.read().decode(errors='replace')
    print(json.dumps(result))
'''


def evidence(job):
    p = job["ray_profile"]
    return json.loads(call(p, "exec", reader(p), "-c", "ray-head", "--", "python", "-c", READ,
                           job["output_dir"], json.dumps(FILES), "inspect"))


def preflight(p):
    pvc = json.loads(call(p, "get", "pvc", p["pvc"], "-o", "json"))
    if pvc.get("status", {}).get("phase") != "Bound":
        raise ValueError("Ray persistent volume is not bound")
    # A read-only server dry-run validates the CRD and admission/resource contract.
    manifest = render(IMAGE, "canopy-preflight", p["output_base"] + "/preflight", "full-forest-inference",
                      p["input_dir"], p["namespace"], p["pvc"])
    call(p, "create", "--dry-run=server", "-f", "-", payload=json.dumps(manifest))
    script = '''from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve()
assert root.is_relative_to('/mnt/storage/forestseg/runs')
for name in ('gt/wytham_val_voxel01_gt.npy', 'pred/wytham_val_voxel01_baseline.npy'):
    p=(root/name).resolve()
    assert p.is_relative_to(root) and p.is_file(), 'Missing or escaped frozen input'
checkpoint=Path('/mnt/storage/forestseg/runs/canopy-treelearn/checkpoints')/(sys.argv[2]+'.pth')
assert checkpoint.is_file(), 'Missing pinned checkpoint cache'
print('Inputs and checkpoint present; payload SHA256 pins are rechecked on the GPU worker')
'''
    return call(p, "exec", reader(p), "-c", "ray-head", "--", "python", "-c", script, p["input_dir"], CHECKPOINT_SHA).strip()


def manifest(job):
    p = job["ray_profile"]
    result = render(IMAGE, job["ray_name"], job["output_dir"], "full-forest-inference",
                    p["input_dir"], p["namespace"], p["pvc"])
    result["metadata"]["labels"]["canopy-workbench-job"] = job["id"].lower()
    return result


def lookup(job):
    raw = call(job["ray_profile"], "get", "rayjob", job["ray_name"], "--ignore-not-found", "-o", "json")
    obj = json.loads(raw) if raw.strip() else None
    if obj and obj["metadata"].get("labels", {}).get("canopy-workbench-job") != job["id"].lower():
        raise ValueError("RayJob ownership differs from the saved Workbench job")
    return obj


def reconcile(job):
    obj = lookup(job)
    status = (obj or {}).get("status", {})
    job["ray_status"] = status
    deployment = status.get("jobDeploymentStatus", "")
    execution = status.get("jobStatus", "")
    data = evidence(job)
    result = data["reports"].get("result.json", {})
    if job.get("cancel_requested"):
        job["status"] = "cancelling" if obj else "cancelled"
    elif result.get("status") == "succeeded":
        if (result.get("image") != IMAGE or result.get("source_commit") != COMMIT
                or result.get("input_sha256") != INPUT_SHA or result.get("checkpoint_sha256") != CHECKPOINT_SHA
                or result.get("coverage", {}).get("points") != 3378949
                or not re.fullmatch(r"[a-f0-9]{64}", result.get("prediction_sha256", ""))):
            raise ValueError("Saved result does not match the audited workflow pins")
        job["status"] = "succeeded"
        job["result"] = result
    elif execution in {"FAILED", "STOPPED"} or deployment in {"Failed", "ValidationFailed"}:
        job.update(status="failed", error=status.get("message") or "Ray execution failed; inspect persisted evidence")
    elif not obj:
        job.update(status="interrupted", error="RayJob is absent and no valid completion report exists; outputs are retained")
    elif deployment == "Complete" or execution == "SUCCEEDED":
        job.update(status="failed", error="Ray completed without the required pinned completion report")
    else:
        job["status"] = "running"
    job.pop("connection_error", None)
    return data


def cancel(job):
    if job["status"] not in ACTIVE:
        raise ValueError("Only active Ray jobs can be cancelled")
    obj = lookup(job)
    if obj:
        call(job["ray_profile"], "delete", "rayjob", job["ray_name"], "--wait=false", "--cascade=foreground")
    job.update(cancel_requested=True, status="cancelling" if obj else "cancelled")


def download(job, name, destination):
    if name not in FILES:
        raise ValueError("Unknown artifact")
    if job["status"] in ACTIVE:
        raise ValueError("Wait for execution or cancellation to finish before downloading an artifact snapshot")
    p = job["ray_profile"]
    head = reader(p)
    args = ("exec", head, "-c", "ray-head", "--", "python", "-c", READ,
            job["output_dir"], json.dumps([name]))
    expected = job.get("result", {}).get("prediction_sha256") if name == "instance-predictions.npy" else None
    return copy_verified(p, args, destination, expected)


def copy_verified(p, args, destination, expected=None):
    """Copy one caller-allowlisted PVC artifact with bounded verified responses."""
    metadata = json.loads(call(p, *args, "stat"))
    size = metadata["size_bytes"]
    if not isinstance(size, int) or not 0 <= size <= 2 * 1024**3 or not re.fullmatch(r"[a-f0-9]{64}", metadata["sha256"]):
        raise ValueError("Invalid artifact metadata")
    if expected and metadata["sha256"] != expected:
        raise ValueError("Persisted artifact checksum differs from the expected contract")
    digest = hashlib.sha256()
    started = time.monotonic()
    try:
        with destination.open("wb") as stream:
            for offset in range(0, size, 4 * 1024**2):
                count = min(4 * 1024**2, size-offset)
                # Large kubectl exec streams may close early with exit status zero.
                # Bounded, self-verifying responses make truncation retryable.
                for attempt in range(3):
                    if time.monotonic() - started > 120:
                        raise ValueError("Artifact transfer exceeded the two-minute limit")
                    try:
                        packet = json.loads(call(p, *args, "chunk", str(offset), str(count)))
                        block = base64.b64decode(packet["data"], validate=True)
                        if (packet["offset"] != offset or packet["size_bytes"] != size or len(block) != count
                                or hashlib.sha256(block).hexdigest() != packet["sha256"]):
                            raise ValueError("Artifact chunk integrity check failed")
                        break
                    except (ValueError, KeyError, subprocess.TimeoutExpired) as e:
                        if attempt == 2:
                            raise ValueError(f"Artifact chunk transfer failed at offset {offset}") from e
                stream.write(block)
                digest.update(block)
        if digest.hexdigest() != metadata["sha256"]:
            raise ValueError("Artifact read-back checksum differs from its source")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
