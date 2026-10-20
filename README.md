# Canopy · tree-instance data

Discover public LiDAR sources for individual-tree segmentation, compare their
reference coverage and inspect source evidence and limitations.

Published at https://borjaarroyo.github.io/forestry-lidar-catalogue/.

## How the pieces fit

A pinned provider **record** (10 sources) is curated into the graph. A verified
local **download** of a reviewed record feeds a source-specific, validated
**preparation** that produces a **task package** with native fields, reference
masks and published splits:

```
record (pinned Zenodo release)          read-only curation
   └── download (provider checksums, resume)     requires the local service
          └── prepare (source-specific adapter)   validated end to end
                 └── task package (NPZ + provenance)   no benchmark claims added
```

Quick paths:

- **Browse the catalog**: open the published site above. No setup required.
- **Prepare a dataset selection in the browser**: choose a preparation source and a
  data use in Workbench, then select collections and partitions. Only admitted implementations can run; current
  FOR-instance and FGI-EMIT are executable. Other source review gaps remain visible.
- **Get FOR-instance locally**: run the download service (below) and select
  "Prepare instance data after download".
- **Add a source or transformation**: read [CONTRIBUTING.md](CONTRIBUTING.md)
  first; admission requires reviews, evidence and passing validation.

## Current scope

- Ten pinned source records, search, filters, comparison and metadata export.
- Source labels and task preparation are reported separately. FOR-instance has a validated local preparation for all 32 LAS plots present
  in its pinned archive. FGI-EMIT has an independently validated 19-plot adapter, including native spectral masks. Other adapters remain TBD.
- The local service downloads all assets of a reviewed record into a chosen
  directory, checks provider checksums, verifies ZIP extraction, preserves
  originals and supports checkpoint-based resume.
- FOR-instance has [versioned contracts and evidence](FOR-INSTANCE.md).
  The adapter preserves native data and published dev/test assignments. Those
  assignments do not establish geographic independence.

**The instance-segmentation path supports FOR-instance v1 and FGI-EMIT.**
Download its pinned archive and prepare the 32 available plots, or reuse an
existing verified acquisition. The 50 NIBIO2 entries missing from this archive
remain explicitly reported. Other unadmitted sources and independent-zone evaluation are
still work in progress. Do not interpret a successful download as semantic validation,
scientific admission or a new independent evaluation zone.

## Run original downloads locally

GitHub Pages serves the catalog. Writing verified source files to a selected
host directory requires the Python download service:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/serve_knowledge_hub.py --port 8765
```

In the research checkout, use the existing ingestion environment and
`scripts/lidar-ingestion-requirements.txt` instead of the public requirements.
Open http://127.0.0.1:8765/#workbench. Inspect a source, review its assets and
enter a new absolute destination directory. Only admitted inventory records
are accepted; this operation does not add new records to the catalog. For FOR-instance, select
"Prepare instance data after download" and a separate output directory, or use
the existing-acquisition preparation form. Preparation runs locally, without Ray.

Resume uses the same matching single-record destination and staging directory.
A nonempty unrelated destination is rejected. Only ZIP assets are expanded.
Compressed size is a lower bound; extraction and staging need additional space
and a 5 GiB staging reserve. Only one Canopy job is admitted at a time. Do not
run other writers with unrelated staging/lock directories against the same root.
The service binds to loopback and is intended for one trusted local user.

Closing the browser or stopping the HTTP service does not cancel an already
launched download worker. Job state and logs remain in `temp/canopy-workbench/`,
staging areas in `temp/canopy-stage-*`, and every completed acquisition is
recorded in `temp/acquisitions/index.json` with its canonical path and
status SHA256, so workspaces stay locatable. They are excluded from
publication. Export evidence before removing local state. Set `CANOPY_STATE`
to an absolute directory to keep all of this state (jobs, staging, locks and
the acquisition index) in one dedicated root outside the checkout instead;
nothing else moves.

## FOR-instance output

The [task-package contract and reader](TASK-PACKAGE.md) formalize these outputs.
The service now completes preparation only after the independent validator has
checked every prepared chunk. The workbench distinguishes downloading, preparing
and checking output, and exports the validation report with its artifact hashes.
Independently validate a complete package or inspect one bounded block:

```bash
python scripts/task_package.py validate /absolute/prepared-package
python scripts/task_package.py sample /absolute/prepared-package
```


The self-contained package in `scripts/for_instance/` includes its entrypoint,
source lock, exact requirements, mask policy, hashes and offline regression tests.
It accepts only the reviewed release, preserves all rows, XYZ and native fields,
and writes NPZ chunks plus `task-package.json`. Unknown-reference points remain
available for inference; terrain and positive tree IDs have explicit masks. No
spatial curation, normalization, benchmark score or new geographic split is added.

```bash
python scripts/for_instance/prepare.py --input /absolute/acquisition --output /absolute/new-instance-package
```

Failed input reads retry at most three times against unchanged expected hashes.
Only verified input snapshots are converted. Complete plots are checkpointed;
matching interrupted outputs resume without rewriting verified plots. Existing
unrelated destinations, changed package contracts and corrupt outputs are rejected.
Allow space for lossless outputs (about 11 GB for this release) and the largest
input snapshot. `evidence/for-instance-preparation-validation.json` records the
full-source validation scope and implementation/package fingerprints.

## Evidence and maintenance

Curated facts live in `knowledge-model.json`, validated by JSON Schema and graph
reference checks. `catalog.json` and `catalog.js` are generated presentation
snapshots. See [DATA-MODEL.md](DATA-MODEL.md) and
[CONTENT-REVIEW.md](CONTENT-REVIEW.md) for evidence scope and unresolved questions.
Acquisition counts describe a saved research workspace, not the current browser.
Provider licenses are recorded declarations; intended-use review remains required.

New sources and changed transformations follow [the admission process](CONTRIBUTING.md)
and [pipeline requirements](PIPELINES.md). In the research checkout those guides
are under `knowledge-hub/contribution/`. A transformation must be analyzed,
self-contained and validated for its declared dataset/task combination before
it becomes executable. The [roadmap](ROADMAP.md) lists the remaining MVP gates.

## Retired experiments

The graph explorer, generic preprocessing controls, PLY inspector, benchmark
runner, image registry and frozen Wytham diagnostic are outside this product
build. Their UI, callable service operations and public bundle entries were
removed, rather than left as hidden runnable features. Their historical code
and evidence are retained in the research checkout under
`archive/canopy-experiments-20261018/`; the previous public snapshot remains in
Git history at `04f05ac0cec819f302283e2f23e3e5c87f5f49c1`.

The canonical graph, scientific caveats and source evidence remain current.
Legacy normalization code and policy are retained only to interpret existing
recorded outputs and verify the pinned implementation described in the graph.
They do not constitute an admitted instance pipeline. No raw data, study results
or unrelated research code were deleted by this cleanup.

## Verification and publication

```bash
python scripts/knowledge_model.py
python tests/test_knowledge_model.py
python tests/test_catalog_content.py
python tests/test_knowledge_hub_service.py
python tests/test_pinned_sources.py
python scripts/for_instance/test_pipeline.py
python tests/test_task_package.py
node --check app.js
node --check workbench.js
```

In the research checkout the JavaScript files are under `knowledge-hub/`.
The publication builder uses an explicit allowlist and records file SHA256 in
`publication-manifest.json`. It excludes archives, previews, local logs,
credentials, machine paths and unrelated research work.

The [FGI-EMIT review and adapter](FGI-EMIT.md) document full-source validation, conservative references, native multispectral masks and unresolved calibration.


## Prepare reviewed plots in the browser

Workbench prepares complete reviewed FOR-instance or FGI-EMIT LAS selections
without a processing backend, using a local LAS, a local ZIP, or a selected member
retrieved directly from the pinned Zenodo ZIP. It checks the LAS SHA256, processes bounded
blocks using Pyodide/laspy/NumPy, independently validates all outputs and offers a
ZIP download from browser storage. The previous Linux emulator is no longer loaded.

Firefox 157 acceptance covers a complete 357,435-point plot; its two NPZ files
are byte-identical to the native reference. Selective ZIP intake also passed in native Firefox for that plot. A second
Chromium run prepared all 1,816,672 CULS plot points, preserving treeSP and
producing eight NPZ files identical to the audited native reference. The full
provider-archive checksum remains explicitly unchecked. Whole-release
browser preparation and LAZ remain unvalidated. A larger four-plot run now covers 5,541,993 points and 24 native-equivalent blocks. See
[BROWSER-PREPARATION.md](BROWSER-PREPARATION.md) for the exact contract, evidence,
storage behavior and limitations. The existing native service remains available
for whole-archive acquisition and preparation into a chosen directory.


## Choose requirements and execute an audited preparation

Select training, evaluation or inference data and mark extra variables required,
optional or off. Optional multispectral measurements retain FOR-instance as a
candidate and are explicitly omitted from its output. Required reflectance blocks
that route; FGI-EMIT exposes three native reflectance columns and their validity masks. Physical units, calibration and channel association accuracy remain unresolved.

Choose an admitted source, add subsets, then review the frozen dataset plan. Import a saved plan to repeat its exact current versions. The browser
restricts the reviewed plots to the published partitions for that use, downloads
and verifies the selected source, runs the admitted transformation and independent
validator, and exports a ZIP with `task-plan.json` and `task-validation.json`.
The optional local service retains FOR-instance whole-archive preparation. FGI-EMIT also has a per-LAS native entrypoint; the browser executes one source per plan.
See [Task requirements and consumption](TASK-REQUIREMENTS.md).

## Load prepared dataset folders

Workbench exports `dataset.json` and preserved partition/source folders in a ZIP.
Extract it and use `TaskDataset`. See [TASK-DATASET.md](TASK-DATASET.md) for the
layout, bounded loader and composition of existing prepared subsets.
