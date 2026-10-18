# Canopy · tree-instance data

Discover public LiDAR sources for individual-tree segmentation, compare their
reference coverage and inspect source evidence and limitations.

Published at https://borjaarroyo.github.io/forestry-lidar-catalogue/.

## Current scope

- Ten pinned source records, search, filters, comparison and metadata export.
- Source labels and task preparation are reported separately. No complete-source
  instance preparation pipeline is audited yet.
- The local service downloads all assets of a reviewed record into a chosen
  directory, checks provider checksums, verifies ZIP extraction, preserves
  originals and supports checkpoint-based resume.
- FOR-instance has [versioned contracts and evidence](FOR-INSTANCE.md).
  Its task adapter remains a disabled draft. Published dev/test assignments do
  not establish geographic independence.

**The end-to-end instance-segmentation MVP is still work in progress.**
Task-specific asset selection, executable transformation and task-ready outputs
remain pending. Do not interpret a successful download as semantic validation,
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
are accepted; this operation does not add new records to the catalog.

Resume uses the same matching single-record destination and staging directory.
A nonempty unrelated destination is rejected. Only ZIP assets are expanded.
Compressed size is a lower bound; extraction and staging need additional space
and a 5 GiB staging reserve. Only one Canopy job is admitted at a time. Do not
run other writers with unrelated staging/lock directories against the same root.
The service binds to loopback and is intended for one trusted local user.

Closing the browser or stopping the HTTP service does not cancel an already
launched download worker. Job state and logs remain in `temp/canopy-workbench/`.
They are excluded from publication. Export evidence before removing local state.

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
node --check app.js
node --check workbench.js
```

In the research checkout the JavaScript files are under `knowledge-hub/`.
The publication builder uses an explicit allowlist and records file SHA256 in
`publication-manifest.json`. It excludes archives, previews, local logs,
credentials, machine paths and unrelated research work.
