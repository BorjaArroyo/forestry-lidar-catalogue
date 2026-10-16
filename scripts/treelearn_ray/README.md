# TreeLearn on an isolated KubeRay RayJob

This is a runtime prototype, not an enabled Canopy benchmark recipe. Buildx builds
an amd64 image on the local ARM machine. All dataset evaluation and CUDA checks
run remotely. The existing RayCluster is not modified.

## Runtime audit

- Upstream: https://github.com/ecker-lab/TreeLearn, commit
  `fd240ce7caa4c444fe3418aca454dc578bc557d4`. Tracked upstream code is unmodified.
- Base: NVIDIA CUDA 11.8 / cuDNN 8 / Ubuntu 22.04, pinned by digest in Dockerfile.
- Python 3.10; Ray 2.55.1; PyTorch 2.0.0+cu118; torchvision 0.15.1+cu118;
  spconv-cu118 2.3.6; cumm-cu118 0.4.11. Prebuilt wheels avoid local CUDA compilation.
- The official pip pairing uses torchvision 0.15.1; upstream's conda script uses
  0.15.0. Notebook-only Jupyter is omitted. Ray, SciPy, spconv/cumm and the
  logger/plot dependencies are explicitly pinned. Full resolved Python and OS
  package snapshots are embedded and copied into successful run outputs.
- Direct dependencies and upstream source are pinned. Apt packages and transitive
  dependency resolution can change in a future rebuild. Use the published image
  digest for identical execution, and retain the embedded package snapshots.
- Neither credentials, point clouds nor model weights enter the build context.
  The assembler exports the pinned Git tree, ignoring local untracked changes.

## Build

Requires Docker/Buildx, Git and Python 3.12+ on the build host. Run from the research
repository root (use a new context directory on each invocation):

```bash
python3 scripts/treelearn_ray/build_image.py --context temp/treelearn-ray-build
# Or reuse a verified upstream clone:
python3 scripts/treelearn_ray/build_image.py --context temp/treelearn-ray-build-2 --source temp/treelearn-src
```

Inspect the image and verify imports from outside the source directory:

```bash
docker run --rm --platform linux/amd64 --workdir /tmp canopy-treelearn-ray:fd240ce-cu118-ray2551-r5 python -c 'import ray, torch, spconv.pytorch; from tree_learn.model.tree_learn import TreeLearn; from tree_learn.util import evaluate_instance_segmentation; print(ray.__version__, torch.__version__, torch.version.cuda)'
```

Publication target: `ghcr.io/borjaarroyo/canopy-treelearn-ray`. GHCR authentication
requires package write permission. Publish, obtain its **registry manifest digest**,
and make the package readable by the cluster (public or use an imagePullSecret).
A Docker image ID is not a substitute for this digest. Registry publication and
GPU validation must succeed before marking this runtime ready.

## Render and validate an isolated job

`render_job.py` only prints JSON; it never submits a job. Replace IMAGE with the
published immutable registry reference. Choose a unique output directory per run.

```bash
python3 scripts/treelearn_ray/render_job.py --image "$IMAGE" --name canopy-treelearn-gpu-check --mode gpu-smoke --output-dir /mnt/storage/forestseg/runs/canopy-treelearn/gpu-check-001 > temp/treelearn-gpu-job.json
kubectl --context cluster-etsit apply --dry-run=server -f temp/treelearn-gpu-job.json
kubectl --context cluster-etsit apply -f temp/treelearn-gpu-job.json
kubectl --context cluster-etsit -n kuberay get rayjob canopy-treelearn-gpu-check
```

The target-specific renderer uses namespace `kuberay`, PVC `borja-lidar`, GPU node
`bluey` or CPU node `nice`. Head and worker share the same Python/Ray/image. It
creates one worker, disables autoscaling and retries, imposes a one-hour deadline,
and requests cluster shutdown with a ten-minute post-job grace period. Inspect
`result.json` or `failure.txt` on the PVC before removing the RayJob. It persists
outputs before reporting success. Cluster scheduling/image-pull failures occur
before the driver starts: inspect RayJob status, pod events and logs in that case.
The shared PVC mount is writable; this prototype is for trusted maintainer jobs.
Pod service-account tokens are disabled. Shared PVC ownership is not changed.

GPU smoke validates a small matrix product, sparse convolution and TreeLearn
construction. It does **not** load a checkpoint or validate end-to-end inference.
No GPU is requested for CPU evaluation.

## Existing Wytham baseline evaluation

Mode `baseline-evaluation` takes `--input-dir` containing these immutable inputs:

| Relative path | SHA256 |
| --- | --- |
| gt/wytham_val_voxel01_gt.npy | f0405d94b303862ff82fb0472785bf0cffaa60d4bd58bec6fbb92f21e0f55883 |
| pred/wytham_val_voxel01_baseline.npy | 920ba6ced44e891c47c42cd9b275c43ff5ef252178e8d128e4e762bbe4b2f64f |

These are existing 0.1 m Wytham validation exports from Zenodo record 16875688:
3,378,949 points, 178 ground-truth tree IDs and 105 positive baseline IDs.
The earlier preparation manifest reports 104 baseline clusters due to an
incorrect exclusion of component zero. Inputs are preserved; the driver computes
the actual count and records it in input-evidence.json. The original preparation
script is not shipped as an audited general-purpose preprocessing pipeline.

The worker copies inputs to temporary local storage, verifies byte hashes and
schema, then invokes the unmodified upstream evaluator with IoU/precision/recall
thresholds 0.5 and ten XY/Z partitions. Its original five-neighbor propagation,
matching, filtering and aggregation semantics remain in place. Local temporary
paths are retained in the copied evaluation config as provenance; they expire.
Logs and any evaluation outputs are copied to the persistent unique output folder,
including partial outputs if the evaluator fails. Original inputs are never written.

This is an unsupervised connected-components baseline, **not TreeLearn inference**,
not a paper reproduction, and not evidence that a checkpoint generalizes. Official
inference needs a separately validated input adapter, checkpoint hash, full model
forward pass and dataset/task audit before enabling the recipe.

## Prototype verification

```bash
python3 -m unittest discover -s scripts/treelearn_ray -p 'test_*.py'
```

Manifest tests cover resource isolation, immutable image references and shell/path
validation. Server dry runs check the installed CRD only; they do not prove that
an image can be pulled, a pod starts, storage is writable or CUDA works.

References: [Docker Buildx](https://docs.docker.com/build/building/multi-platform/),
[KubeRay RayJob](https://docs.ray.io/en/latest/cluster/kubernetes/getting-started/rayjob-quick-start.html),
[PyTorch version pairing](https://docs.pytorch.org/get-started/previous-versions/),
[spconv](https://github.com/traveller59/spconv).

## Observed execution evidence (2026-10-16)

The public r2 runtime is pinned at
`ghcr.io/borjaarroyo/canopy-treelearn-ray@sha256:6cf959b6f75b8bac51814af81d2e28d7d3cda184475912e899dd30b98b7a2528`.
Anonymous registry access and a remote RayJob GPU smoke passed on an RTX 4090
(compute capability 8.9). The model has 30,106,981 parameters. This validates
runtime construction and sparse CUDA kernels, not a checkpoint forward pass.
The initial smoke failed only when reading the parameter count after chaining
`eval()`; upstream `train()` returns None. The r2 driver calls `eval()` separately.

The full XY/Z baseline evaluation on the original image failed in unmodified
`tree_learn/util/eval.py:159`: XY partition normalization accesses the fifth
farthest GT point, but one voxelized GT instance has only two points. Input
hashes passed. No labels were removed, protocol changed, or score reported.
A task-specific sparse-instance policy must be audited before enabling this
benchmark. See `validation.json` for exact run and image provenance.
Both temporary RayJobs were removed after their evidence was retained on the PVC
and copied to local `temp/treelearn-ray-cuda/evidence/`.

## Audited sparse evaluation and checkpoint sample

The current driver also supports `checkpoint-inference`, with the same fixed input
directory as baseline evaluation. The renderer requests a 16 GiB worker and one
GPU for that mode. See [ANALYSIS.md](ANALYSIS.md) for the explicit preprocessing,
checkpoint-loading policy and limits. The image keeps all adapter code together.

Sparse-partitions-v1 preserves all 178 Wytham GT instances. The corrected CPU run
succeeded; only GT instance 859 (two voxel points) has undefined XY/Z partitions.
Its detection and whole-instance metrics remain included. Dense applicable
partitions retain upstream calculations. These changes are an explicit protocol
extension, not identical upstream behavior. The connected-components baseline
outputs are infrastructure evidence, not TreeLearn model performance.

Run adapter regressions in the matching image (tiny synthetic inputs only):

```bash
docker run --rm --platform linux/amd64 --mount type=bind,source="$PWD/scripts/treelearn_ray",target=/checks,readonly --workdir /checks ghcr.io/borjaarroyo/canopy-treelearn-ray:fd240ce-cu118-ray2551-r5 python -m unittest test_partition_policy test_render_job -q
```

## Completed validation (2026-10-16)

The audited CPU evaluator succeeded with all 178 GT rows retained and 177 eligible
XY/Z partition rows. GT 859 has two points and explicit undefined partitions.
Real checkpoint inference succeeded on 280228 geometry-selected points on an
NVIDIA GeForce RTX 3090. Weights loaded strictly with weights_only=True; saved
finite logits, offsets, semantic classes and unique source indices were verified.
The copied prediction artifact's SHA256 matches its run manifest.
The checkpoint SHA256 is recorded in checkpoint-lock.json. Current image:
`ghcr.io/borjaarroyo/canopy-treelearn-ray@sha256:b14f68e55e3db691b48d3f2da655200a560a81dd2a327bef00da62658f53d063`.
The evaluation used r3; r4 changes only the inference point-count guard. No full
forest instance segmentation or independent benchmark accuracy is claimed.
Temporary clusters were removed after evidence capture. Raw evidence remains on
the PVC and under local temp/treelearn-r3/evidence/. See validation.json for runs.

## Completed full frozen-cloud validation (2026-10-16)

`full-forest-inference` succeeded in an isolated RayJob on the RTX 3090. It
processed all 225 tiles, combined 9507369 overlapping inner predictions into
2356409 ensemble coordinates, and returned predictions for all 3378949 original
frozen-export rows in their original order. It predicted 157 positive instance
IDs and 817676 non-tree points. Two source points used upstream KNN fallback.
The full pipeline took about 303 seconds; the complete workflow with audited
evaluation took about 425 seconds. Saved output geometry, labels and SHA256 were
independently checked on the execution host and the local copied hash matched.
All 178 GT rows remain in evaluation, with 177 applicable XY/Z partition rows.

Diagnostic detection F1 was 63.6%, completeness 54.5%, commission error 23.6%;
mean segmentation precision 57.4%, recall 86.0%, coverage/IoU 52.4%. These are
**in-source diagnostics**, not an independent test or a published-score reproduction.
The run does not process the 30497066-point raw acquisition.

Image: `ghcr.io/borjaarroyo/canopy-treelearn-ray@sha256:bfe3194d979cec051fadb104ee817571614cc66172347a5eed1a5aa56e7fd6ac`.
Full prediction SHA256:
`a2d39f6e1d03643e6f93b44077e6956a518c6cc6489f73f3c5160be66d3fb9e5`.
Artifacts persist on the PVC under the run's unique output directory and locally
in `temp/treelearn-full/evidence/outputs/`. Configurations, coverage, evaluation,
logs, dependency snapshots and independent verification are retained. The
temporary RayJob was removed after capture. `validation.json` records provenance.

To render a matching job, use `--mode full-forest-inference` and a new output
directory. Inputs use the existing frozen dataset directory; its parent must
contain `checkpoints/<checkpoint SHA256>.pth`, matching checkpoint-lock.json.
The workflow does not download a new unchecked checkpoint automatically.

## Canopy Workbench

The scoped frozen-Wytham recipe is available through the loopback Workbench.
It submits an isolated RayJob, retains tracking across service restarts, supports
cancellation and exposes persistent reports and prediction downloads. See
[WORKBENCH.md](WORKBENCH.md) for deployment setup, boundaries and validation.
The generic benchmark recipe remains disabled.
