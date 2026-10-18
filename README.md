# Forestry LiDAR catalogue · Canopy

A task-oriented catalog of forest LiDAR datasets, semantic relationships,
benchmark protocols and caveats.

Published at https://borjaarroyo.github.io/forestry-lidar-catalogue/.

The public site provides dataset search and comparison, a compatibility graph,
transformation specifications, audit evidence, benchmark links and caveats,
and container environment metadata. Catalog exports contain metadata, not
LiDAR point clouds or model weights. Original data remains at the linked
provider records under its declared terms.

## Sources first

The entry point compares public sources by platform, data unit, reported instance
reference and task preparation. Cards and comparisons keep annotation availability
separate from pipeline readiness. No complete-source pipeline is marked ready.
Record sizes cover all pinned assets, not a task-specific subset. Source details
expose preparation, then expandable evidence, native fields and relationships.
Original download review transfers the selected record to the connected workbench;
it does not start acquisition. Historical workspace counts, graph relationships
and the frozen Wytham/TreeLearn diagnostic are secondary views.

## Task decisions

The visible task is individual-tree segmentation. Other research tasks are hidden
from navigation, profile task assessments and benchmark filters, and recorded as
TBD in metadata. Their source descriptions remain preserved for future review.


The instance-segmentation view answers two questions: whether selected data
can supply plot-instance reference, and what a model evaluation can establish.
Requirements, exact native-label mappings, masks and evidence fingerprints are
explicit. FOR-v2 is a native schema, not a universal ontology. Unknown geographic
independence is never promoted to supported. The existing finetuned-on-all
Wytham checkpoint supports diagnostics, not independent evaluation.

The connected service can prepare the already audited frozen Wytham reference
into a new selected directory, with verified SHA256 and `task-package.json`.
This is a copy of the 3,378,949-point prevoxelized export, not the raw acquisition
or an independent benchmark. Other whole-dataset preparations remain gated.
Original-source download is separately labeled and does not confer task readiness.

## Browser PLY inspection

Open the Data workbench on the public site and choose a local PLY file.
The built-in recipe reads ASCII or binary PLY 1.0 (both byte orders), counts
vertices, lists attributes, computes finite XYZ bounds, and checks all declared
element records. Selected payloads stay on the device. The recipe uses a
JavaScript Web Worker; it does not claim to run a Docker/Wasm container.

The prototype accepts files up to 512 MiB and reads in 256 KiB chunks. Progress
and cancellation are available. Execution time and the largest input byte
buffer are reported; this buffer measurement is not total browser RAM.
Coordinates, units and CRS are not transformed or inferred. Nonfinite XYZ
vertices are counted and excluded from bounds. No source file is written and
no source content hash is computed.

Choose an output folder where the browser supports File System Access, or use
Download JSON report. Reports use unique names and an existing report is never
intentionally overwritten. Folder-picker support and permission prompts vary
between browsers. Selecting a source file uses the standard file picker.

Parser regression checks (Node.js):

```bash
node --test tests/test_ply_inspector.cjs
```

## Optional local companion

GitHub Pages serves static files and cannot execute the Python workbench.
Download or clone this repository, then use a Python 3.11 environment:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/serve_knowledge_hub.py
```

Open http://127.0.0.1:8765/#workbench. The loopback service enables explicit,
version-pinned Zenodo downloads into a selected absolute directory, source-aware
duplicate-review plans, and persistent background jobs.
Downloading and extracting assets can require substantial local and destination
space. Original files remain preserved. Only ZIP archives are expanded.
Existing source/schema normalization workflows run without repeated approval.
New datasets and unknown schemas require prior analysis. Verified local input
copies isolate conversion from mounted read-back instability. Existing semantic
and rights limitations remain; see [PIPELINES.md](PIPELINES.md).

Curation review groups recorded source and normalized hashes, checks source
file sizes and proposes connected cloud identities. macOS AppleDouble sidecars
are ignored. Support-file duplicates are kept separate from cloud identities.
It does not rehash payloads, establish near-duplicate geometry or delete files.
Jobs and reports are local under `temp/canopy-workbench/`. They are not included
in this repository or transmitted to the public site. Stopping the web server
does not cancel an already running background worker. Do not run concurrent
writers using different lock/staging directories against the same data root.

## Benchmark readiness

The registry includes TreeLearn evaluation and ForestFormer3D documentation.
Author-documented caveats, local audit findings and code-inspection findings are
separate. This is an initial review, not a complete article audit or independent
reproduction. Shared Wytham/TLS exports must not be treated as independent sites.
Acquisition counts are a saved workspace snapshot, not live provider availability.

The generic TreeLearn and ForestFormer3D recipes remain disabled. The separate
**TreeLearn · frozen Wytham on Ray** recipe is enabled only for its audited,
SHA256-pinned export, checkpoint, protocol and public CUDA image. Its validated
run covers all 3,378,949 frozen input points; metrics are in-source diagnostics.
The checkpoint was finetuned on all data, so no independent score is claimed.

The optional loopback service submits isolated KubeRay jobs through the host's
existing kubectl credentials. It supports persistent tracking, cancellation and
artifact downloads, including prediction read-back checksums. Kubernetes may pull
the pinned public image; no local inference or Docker daemon is required for this
recipe. Deployment setup and limitations are in
[the remote Workbench guide](scripts/treelearn_ray/WORKBENCH.md). Local deployment
profiles, kubeconfig, job history and outputs are never published.

## Evidence and updates

[The content review](CONTENT-REVIEW.md) distinguishes provider reports, saved
local observations, code inspection and unresolved questions across all ten sources.
The initial article entries are documentation/code reviews; full methods/results
critiques remain pending. Curated entities and relationships are authored in
`knowledge-model.json`, validated by `knowledge-model.schema.json` and reference
checks. See [the data model](DATA-MODEL.md) and the
[FOR-instance contract description](FOR-INSTANCE.md). Profiles and relationship
views are generated directly into the catalog; source relevance does not
constitute scientific or execution admission.


Dataset proposals and admission reviews follow [CONTRIBUTING.md](CONTRIBUTING.md).
New or changed dataset entries require evidence-backed, task-specific review
records and maintainer review before publication. The initial ten records remain
a legacy snapshot with partial audits; they are not retrospectively certified.

The [curation review plan](curation/README.md) separates recorded duplicate
evidence, source-file size checks, semantic corrections and pending decisions.
No canonical copy is selected and no correction has been applied.

An initial [dataset-specific validation package](pipelines/tls-exact-duplicate-index-v1/README.md)
pins the TLS source's 236 duplicate-candidate files. It remains a draft;
its Workbench adapter is pending; no repeated human approval is required for
its validated existing-source CLI. Local snapshot validation covers all
236 selected files on a verified local snapshot, independently on host and in
the container. Original WebDAV read inconsistencies remain documented; this
does not certify the mount or modify originals.
Validation evidence and the package fingerprint are recorded in
[the pipeline registry](pipelines/registry.json).

The complete original collection was not reread point by point. Review audit
coverage and limitations in the public Evidence & review view. Working-document
paths are references to the original local audit, not published attachments.
The portable catalog retains source metadata hashes and snapshot provenance.
`docs/lidar-acquisition-inventory.json` is a reduced deployment inventory carrying
only the provider IDs, filenames, checksums and metadata needed by the companion.
It is not the byte-identical original inventory referenced by the catalog hash.

Static files are served from the main branch root with `.nojekyll`.
Edit the catalog and its matching `catalog.js` snapshot together. Edit benchmark
recipes in `benchmarks.json`; do not mark unvalidated images or mappings as ready.
The public bundle deliberately excludes local logs, screenshots, credentials,
NAS paths and unrelated research files. `publication-manifest.json` records
checksums of the distributed files.
