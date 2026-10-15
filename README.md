# Forestry LiDAR catalogue · Canopy

A task-oriented catalog of forest LiDAR datasets, semantic relationships,
benchmark protocols and caveats.

Published at https://borjaarroyo.github.io/forestry-lidar-catalogue/.

The public site provides dataset search and comparison, a compatibility graph,
transformation specifications, audit evidence, benchmark links and caveats,
and container environment metadata. Catalog exports contain metadata, not
LiDAR point clouds or model weights. Original data remains at the linked
provider records under its declared terms.

## Local companion

GitHub Pages serves static files and cannot execute the Python workbench.
Download or clone this repository, then use a Python 3.11 environment:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/serve_knowledge_hub.py
```

Open http://127.0.0.1:8765/#workbench. The loopback service enables explicit,
version-pinned Zenodo downloads into a selected absolute directory, source-aware
normalization, duplicate-review reports, and persistent background jobs.
Downloading and extracting assets can require substantial local and destination
space. Original files remain preserved. Only ZIP archives are expanded.
Normalization supports the registered source-specific schemas; unknown schemas
and derivative-rights-review records require separate review.

Curation review groups recorded hashes and checks file sizes. It does not
rehash all payloads, detect every geometric duplicate or delete original files.
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

Both initial execution recipes are disabled. A digest-pinned container, full
source commit, input adapter, protocol configuration and end-to-end validation
are required before enabling a recipe. The registry references OCI images; it
does not host them. The current runner supports prepared CPU recipes only;
GPU execution needs an additional validated adapter. No benchmark score is
claimed as reproduced. No images are automatically built or pulled.

## Evidence and updates

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
