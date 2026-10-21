# Task dataset folders

The common index binds canonical task variables and reviewed source plans.
Extract the Workbench ZIP into a dedicated directory:

```text
dataset/
  dataset.json
  dataset-validation.json
  dataset-plan.json                 # Zenodo runs
  dataset-plan-validation.json      # Exact selected-scene coverage
  dev/zenodo-8287792/task-package.json
  dev/zenodo-8287792/plots/<scene-id>/00000.npz
  test/zenodo-8287792/task-package.json
  test/zenodo-8287792/plots/<scene-id>/00000.npz
```

Only selected, task-permitted partitions appear. Training excludes test scenes;
evaluation uses test scenes; inference may include both. Provider `dev` is never
silently renamed to `train`. No new validation split, common CRS or geographic
independence is inferred. Blocks are not spatial training tiles. Source adapters
retain their independently reviewed native reference policies.

## Load a partition

Install repository requirements and add `scripts` to `PYTHONPATH`:

```python
from knowledge_model import load
from task_dataset import TaskDataset

dataset = TaskDataset('/absolute/path/to/dataset', load())
dataset.validate()
for block in dataset.iter_partition('dev'):
    xyz = block['arrays']['xyz']
    # Supervised requests also expose instance and instance_valid.
    print(block['source_ref'], block['scene_id'], xyz.shape)
```

Complete validation is required before iteration. Source and scene scope must
stay with tree identities. Optional unavailable variables remain omitted.
The loader checks schema, task requirements, exact preparation plans, partition
folders, manifest hashes, scene uniqueness and all independently checked payloads.
It streams one block at a time without point-array conversion or imputation.

## Compose prepared subsets

Browser runs generate these folders directly. Existing prepared packages can be
composed without another download or point transformation:

```bash
python scripts/task_dataset.py export \
  --input /absolute/subset-a --input /absolute/subset-b \
  --output /absolute/new-dataset --use training

python scripts/task_dataset.py sample \
  --output /absolute/new-dataset --partition dev
```

Matching duplicate scenes are included once; conflicting duplicates, policies or
plans fail closed. The destination must be new. Interrupted native exports retain
an `.incomplete.json` marker; existing outputs are never overwritten. Validation
binds the dataset index, schema and reader hashes.

FOR-instance and FGI-EMIT have executable, independently validated source profiles.

Workbench now saves public-source subsets in **My dataset**. Add collections or
partitions, remove individual subsets and reload without losing the draft. The browser
executes selected admitted sources sequentially in one run using Zenodo intake; local-file
preparation remains available when the saved list is empty. Matching overlaps are
retrieved once. Changed requirements block execution until explicitly restored or
the saved list is cleared. The repeated native `--input` option also composes
prepared subsets. Saved drafts are selections, not scientific admission certificates.

Common field shapes alone do not admit
cross-source semantic compatibility. Historical ZIPs keep their original layout.

## Review a public-source preparation plan

For Zenodo input, choose **Review dataset plan**, inspect the summary, then prepare.
With saved subsets, the plan covers their union; otherwise it covers the current
selection. No source LAS is downloaded during review. The pinned Python runtime
and reviewed metadata may be downloaded to resolve the plan.

`dataset-plan.schema.json` defines combined version 2.0.0 and retains the exact
version 1.0.0 source-plan contract. Each combined plan contains one common request,
source plans with their own provenance, global totals and a global fingerprint. `scripts/dataset_plan.py` resolves
and checks the plan using the same canonical task planner as preparation. It records:

- Exact source release, pipeline version, task use, required/optional variables,
  audited outputs and explicit omissions.
- Per-subset membership and unique selected paths, SHA256, points, source sizes
  and original published partitions.
- Reviewed source-lock and complete runtime-lock SHA256, plus a canonical plan
  fingerprint. The runtime lock pins the actual code, schemas and dependencies.
- Point/source-byte totals, overlapping selections retrieved once, estimated
  browser working space and the common output-folder contract.

The preview and downloadable JSON describe planned work, not completed validation.
Changing the task request or effective selection invalidates the preview. Before
any source intake, the worker re-resolves the plan against current pinned metadata
and code. A changed or modified plan requires another review. After preparation,
selected scene identity, checksum, points, partition, source and pipeline must
match the plan exactly; independent array validation and folder validation also
run. The ZIP includes the plan and its coverage report, bound to the prepared
manifest fingerprint. Scientific producer policies are unchanged.

Source LAS sizes are not compressed transfer sizes. Browser storage is an
estimate, checked again against available quota before intake. Published split
preservation does not establish geographic independence. The plan is downloadable
before execution. Use **Import a saved dataset plan** to validate and restore its exact selection and requirements. Import never starts a download and rejects changed versions or pins before replacing the current draft. Interrupted runs still restart; reusing partial output is outside this increment. Local LAS/ZIP preparation keeps its existing
request and payload validation and does not yet produce this public-source plan.


## FGI-EMIT and optional native channels

FGI-EMIT preserves 13 official `train` and six `test` plots. `features[:, 0:3]`
contains unchanged `reflectance_1/2/3` (1550/905/532 nm). `feature_valid` is a
separate mask for each finite value unequal to -9999; invalid source values stay
unchanged. Units/calibration and provider nearest-neighbor association accuracy
remain unresolved. RGB is preserved only inside original records, not substituted
for these measurements. See [FGI-EMIT.md](FGI-EMIT.md).

The native entrypoint prepares one complete reviewed LAS into a new directory:

```bash
python scripts/fgi_emit/prepare.py --input /absolute/plot_1022.las --output /absolute/new-fgi-package
python scripts/task_package.py validate /absolute/new-fgi-package --allow-selection
```

The common export command can compose already prepared FOR-instance and FGI-EMIT
packages if both satisfy the requested task variables. Original source identities,
partition folders and optional omissions stay explicit. A consumer must handle
missing optional variables; the loader never fabricates shared spectral columns
or certifies cross-source calibration. Browser plans can contain both admitted sources. Required reflectance blocks a
selection containing FOR-instance before any payload download; optional reflectance
keeps its absence explicit while FGI retains native channels and masks.

[Browser scale evidence](evidence/browser-bulk-validation.json) covers four complete
FOR-instance plots from three collections, 5,541,993 points and 24 blocks. Every
block matches the audited native reference. This is a bounded larger-selection
test, not full-release browser scalability or interrupted-job resumption.


## Combined browser export

The browser uses one pinned runtime and stages one complete LAS at a time. Every
source package passes its unchanged independent reader before composition; then
all source coverage is checked against the frozen plan and `TaskDataset` validates
the final folders. A failed source, insufficient quota or failed validation cannot
publish a completed ZIP. Starting again restarts the entire selection.

The ZIP contains `dataset.json`, `dataset-validation.json`, combined
`dataset-plan.json`, its coverage report and `browser-run.json`. Under
`provenance/zenodo-<record>/`, each source retains its selection manifest, task
plan, independent validation and individual execution plan. Data blocks remain
under their original partition and source, for example:

```text
dev/zenodo-8287792/task-package.json
dev/zenodo-8287792/plots/<scene>/<block>.npz
train/zenodo-19351234/task-package.json
train/zenodo-19351234/plots/<scene>/<block>.npz
```

Published `dev` and `train` are not renamed or merged into a new scientific split.
Source and scene identities remain separate; neither point deduplication nor
cross-source feature calibration is applied. The task-dataset 1.0 folder contract
and both scientific producer packages are unchanged.


Combined-source browser evidence includes the [downloaded Chromium ZIP](evidence/combined-chromium-validation.json)
and [downloaded Firefox ZIP](evidence/combined-firefox-validation.json), each
with 3,150,462 points and 13 native-equivalent blocks, plus the
[expanded run](evidence/combined-browser-expanded-validation.json) with 9,160,560
points and 39 native-equivalent blocks. The expanded ZIP was created in browser
storage; it was not downloaded for that acceptance case. These are bounded
selections, not full-release browser validation.
