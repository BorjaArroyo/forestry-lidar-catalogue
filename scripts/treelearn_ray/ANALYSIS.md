# TreeLearn adapter audit: sparse metrics and checkpoint inference

## Scope and immutable inputs

TreeLearn source remains unmodified at
`fd240ce7caa4c444fe3418aca454dc578bc557d4`.
Runtime r3/r4 adds only explicit adapter modules. The existing Wytham first-point
0.1 m voxel exports retain their recorded SHA256 pins; no GT, prediction, point,
instance ID or source payload is removed or changed.

## Sparse partition policy v1

Upstream XY and Z functions select the fifth farthest/highest GT point. This is
undefined for fewer than five points; zero radial/height normalization is also
undefined. Both cases are detected before calling the upstream partition code.

- Detection matching, thresholds, five-neighbor propagation and whole-instance
  metrics use every original GT instance and the unmodified upstream evaluator.
- For applicable GT instances, the original XY/Z functions run without changes.
- For inapplicable instances, all partition metric cells are NaN, with their GT
  and matched prediction identities retained. No fabricated zero/perfect scores.
- `partition-policy.json` records applicability counts and each excluded partition
  row's instance ID, point count and reason. Exclusion applies only to partition
  applicability, not to the data or whole-instance evaluation.
- Dense-case parity, retained sparse rows and degenerate normalization are tested
  on tiny examples against the pinned upstream functions. This is an explicit
  protocol extension, not byte-identical upstream behavior or paper reproduction.

## Real checkpoint sample

Provider record 16875688, `TreeLearn_finetuned_weights_all.pth`, is pinned by
provider MD5 `577847cafec23e3a5886a680687f5afd` and size 361611057 bytes.
The worker additionally records SHA256. Download, verification, model loading
and inference execute on Ray. Loading uses `weights_only=True` and `strict=True`;
missing/unexpected or incompatible tensors fail instead of being skipped.

The adapter selects a fixed central 13.5 m XY context tile using geometry alone,
retains full height, caps execution at 350000 points by rejecting larger tiles,
and subtracts the full export XYZ mean. It uses the pinned upstream model defaults
with pipeline spatial shape [500,500,1000], FP32, seed zero, and no feature/coordinate
channels. Constant placeholder features follow those explicit disabled-feature
settings. GT labels are never passed into the network. Output point indices,
original XYZ, semantic logits/classes and offsets are persisted and hash-recorded.

This validates a checkpoint forward pass and output integrity, not complete forest
instance segmentation. It omits grouping and overlapping-tile ensembling. Input
was already voxelized before translation; voxel-grid phase can differ from the
full upstream raw-cloud workflow. The original finetuning configuration has not
been independently recovered: strict architecture matching does not prove its
historical preprocessing. The checkpoint name indicates finetuning on all data;
Wytham is therefore not an independent held-out test. No model score is claimed.

## Reproduction

`build_image.py` assembles only the pinned upstream Git tree and adapter files.
`render_job.py` emits isolated, bounded RayJobs with one worker and unique output
directories. Evaluation requests CPU only; checkpoint inference requests one GPU
and a 16 GiB worker. Original datasets and weights are not baked into the public
image. Results and package snapshots persist on the PVC before temporary cluster
cleanup. `validation.json` records observed execution results and image digests.

The initial inference guard rejected the unchanged 280228-point tile under its
150000-point cap. Revision r4 raises only the explicit guard to 350000 points;
the tile geometry and points are unchanged. This guard failure produced no inference.

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

## Full frozen-cloud workflow

`full_forest.py` runs the pinned upstream pipeline on the complete verified
3,378,949-point Wytham validation export. It does not expand coverage to the
30,497,066-point raw PLY or other acquired datasets. Only XYZ enters the pipeline;
original GT is reserved for the separate evaluation step. Upstream ignored labels
are inference placeholders and never substitute for GT in scoring.

Upstream settings retained: 0.1 m voxelization, verticality radius 0.6 m, inner
tile edge 8 m, outer/context argument 13.5 m, stride 0.5, confidence 0.5,
verticality 0.6, offset 4 m, HDBSCAN minimum cluster size 50, ensembling and
original-input propagation. The worker uses FP32, batch size one, no DataLoader
subprocesses, eight feature/grouping threads and no edge crop. It saves one full
XYZ/instance array rather than optional per-tree/backbone exports. These export
and resource choices do not change grouping thresholds.

Checkpoint loading is strict and weights_only; input and cached checkpoint are
verified by SHA256 on worker-local copies. No weights enter the public image.
The wrapper rejects skipped inference tiles, incomplete/changed-order coordinates,
nonfinite outputs, negative/unassigned IDs and an empty instance result. It records
tile counts, overlapping predictions, ensembled points and propagation fallback
coverage. Original inputs remain untouched. Whole-cloud evaluation uses the actual
frozen GT and sparse-partitions-v1. Scores are in-source diagnostics because the
checkpoint was finetuned on all data; independent accuracy is not established.

Ray resources: one worker, eight CPU, 32 GiB RAM, one GPU; task memory budget
24 GiB, 90-minute task timeout and two-hour job deadline. At least 20 GiB free
local scratch is required. Temporary pipeline intermediates stay on the worker;
logs, configurations, coverage, instance predictions and evaluation persist on
the PVC. A verified content-addressed checkpoint cache avoids repeated downloads.

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
