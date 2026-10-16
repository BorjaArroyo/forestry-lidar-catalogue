# TreeLearn Wytham · remote Workbench execution

The prepared recipe runs full tiled instance segmentation and evaluation on
KubeRay, using the public r5 image by digest. The browser never accepts an
arbitrary image, command, checkpoint, Kubernetes context or input dataset.
Generic TreeLearn and ForestFormer3D recipes remain disabled.

## Validated scope

The complete frozen Wytham validation export contains 3,378,949 points. The
previous validation run covered 225 tiles, produced 157 positive instance IDs,
and preserved every input coordinate and its order. This is not the raw
30,497,066-point acquisition. The checkpoint was finetuned on all data: scores
are in-source diagnostics, not independent accuracy or published-score
reproduction. Historical training preprocessing is not independently recovered.
Sparse-partitions-v1 retains all 178 GT rows; one two-point instance has
undefined XY/Z partition metrics. See `ANALYSIS.md` and `validation.json`.

## Deployment profile

Start the loopback service with the existing Python environment and authenticated
`kubectl`. Its process needs access to the Kubernetes API and local kubeconfig.
It does not use Docker, rebuild images or execute inference locally. Kubernetes
may pull the public digest-pinned image when a node does not have it cached.
GitHub Pages remains a static catalog and cannot itself submit jobs.

Create `temp/canopy-workbench/ray-profile.json` on the service host:

```json
{
  "context": "YOUR_CONTEXT",
  "namespace": "YOUR_NAMESPACE",
  "pvc": "YOUR_PVC",
  "reader_cluster": "YOUR_EXISTING_RAY_CLUSTER",
  "input_dir": "/mnt/storage/forestseg/runs/canopy-treelearn/baseline-f0405d94-920ba6ce",
  "output_base": "/mnt/storage/forestseg/runs/canopy-treelearn/workbench"
}
```

Use the already validated deployment. The renderer currently targets the
`bluey` NVIDIA GPU node, with an isolated 2 CPU / 4 GiB head and one
8 CPU / 32 GiB / 1 GPU worker. Moving to other nodes, datasets or resource
contracts requires review. A two-hour job deadline bounds execution; it does
not guarantee GPU availability or queue start time.

The configured existing reader cluster must have a ready head with a
`ray-head` container and the same PVC mounted at `/mnt/storage`. It only reads
files and metadata; its environment is not changed. Workbench execution uses
a separate RayCluster managed by its RayJob.

The frozen inputs must already be staged. The content-addressed checkpoint
cache must contain `checkpoints/<checkpoint-sha256>.pth` under
`/mnt/storage/forestseg/runs/canopy-treelearn`. `checkpoint-lock.json` pins the
provider asset. Preflight checks presence and server admission; the GPU worker
copies inputs locally, verifies their hashes and validates the checkpoint before
inference. Preflight does not certify queue capacity or rehash large payloads.

## Use

Open `http://127.0.0.1:8765/#benchmarks`, select **TreeLearn · frozen Wytham on
Ray**, then **Check readiness** and **Run on Ray**. Opening the page or checking
readiness never submits execution. Inputs are fixed; each run gets a unique
persistent output directory. Existing directories are never reused by the driver.

Jobs and provenance shows submission state, KubeRay state, errors and cancellation.
Inspect log & evidence exposes persisted pipeline logs, JSON reports and artifact
links. Predictions and reports become downloadable when execution or cancellation
has finished. Downloads are staged to a complete local disk snapshot before HTTP
transfer; prediction SHA256 is checked against the completion report. Large
artifacts use bounded, checksummed chunks and are staged on disk. Truncated
responses are retried per chunk; the final artifact checksum must also match. Downloads require the
configured reader head and PVC to remain available.

Submission intent and the rendered manifest are saved before contacting Kubernetes.
If the create response is lost, refresh the existing job; the service never retries
an uncertain create automatically. An API outage retains active state and blocks
another submission. Restarting the service resumes reconciliation without relying
on a local worker PID. A valid pinned completion report can recover success after
the RayJob TTL expires. Missing RayJob plus missing completion evidence is marked
interrupted, never successful.

Cancellation checks the Workbench ownership label and deletes only that RayJob,
with foreground cascading cleanup. Status remains cancelling until its object
and dependent resources are removed. Cancellation intent survives API timeouts;
use Retry cancellation if the request could not reach Kubernetes. Inputs, outputs,
PVC and existing clusters are retained. Automatic KubeRay shutdown and TTL cleanup
also remain enabled. Do not delete local job state while remote work is active.

## Validation of the adapter

```bash
python -m unittest discover -s tests -p test_knowledge_hub_service.py
python -m unittest discover -s scripts/treelearn_ray -p test_workbench.py
python -m unittest discover -s scripts/treelearn_ray -p test_render_job.py
```

Offline checks cover pinned manifests, input/command overrides, durable submission,
concurrency, uncertain API responses, restart/TTL recovery, failure states,
cancellation ownership and escaped artifact symlinks. The actual deployment also
passed read-only admission/input preflight and a completed result read-back.
The full browser-to-Ray-to-download journey subsequently passed on 2026-10-16.
It covered all 225 tiles and 3,378,949 points, produced 157 instances, and
downloaded byte-identical predictions to the independently verified reference.
The test exposed silent truncation in large kubectl exec binary streams; bounded
base64 chunks with offset, size and SHA256 checks resolved it. See
[workbench-validation.json](workbench-validation.json) for the run evidence.
