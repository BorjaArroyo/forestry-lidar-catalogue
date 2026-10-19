# Changelog

## Browser acceptance and publication

- Verified direct Zenodo intake and preparation of the complete RMIT test plot
  through native Firefox UI.
- Verified a complete second source schema in CULS: 1,816,672 points, treeSP
  preserved, eight exported NPZ files identical to the audited native reference.
- Retained explicit limits: two of five native schemas, no full-archive checksum
  or scientific generalization claim.


## Selective FOR-instance ZIP intake

- Added local ZIP and bounded provider-range inputs to the existing plot preparer.
- Verified the complete RMIT test plot directly from Zenodo using 8 requests and
  3,659,162 transferred bytes; native validation and NPZ reference checks passed.
- Added offline ZIP64/Deflate/Deflate64-literal, corruption, traversal and range
  bounds regressions against the exact vendored ZIP library.
- Whole-archive checksum verification is explicitly outside this selection scope.


## Browser plot preparation

- Replaced the active Linux-emulator inspection panel with a fixed Pyodide worker,
  bounded LAS preparation, OPFS storage and incremental ZIP64 export.
- Added explicit selection manifests without weakening complete-release validation.
- Verified one complete 357,435-point plot in Firefox and native Python; both NPZ
  payloads are byte-identical. Full archive intake and broader browser admission
  remain work in progress.


## End-to-end preparation validation

- Require independent contract validation before a preparation job completes,
  preserving a validation-report hash and visible workflow phases.
- Cover HTTP fixture download, extraction, preparation, validation and unchanged
  resume; reject output corruption even after the producer exits successfully.
- Serve the published container assets through the local service while refusing
  private job files outside the publication manifest.
- Correct the unsupported browser throughput extrapolation and record the
  pinned WASI runtime's missing preparation dependencies with bounded evidence.

## Task-package contract and reader

- Formalize the existing FOR-instance 1.0 manifest with JSON Schema 2020-12.
- Add an independent prepared-array validator and bounded scene reader, preserving
  int64 identities, native records, source-scoped labels and published partitions.
- Test output corruption, reference masks, coordinate precision, scene identity,
  chunk continuity and agreement with the curated graph contract.
- Keep the audited producer and its hashes unchanged; browser preparation and
  FGI-EMIT admission remain separate work.

Notable changes to the catalogue, the knowledge graph and its validation
contracts. The graph's `schema_version` gates structural migrations; presentation
and tooling changes are listed here without a version bump. Follows
[Keep a Changelog](https://keepachangelog.com/) and uses date-based entries.

## 2026-10-19

- The browser container lab is no longer a separate page: its controls are
  embedded in the catalogue's Download & prepare view with the site's own
  styling and navigation (`#workbench`), while the runtime, worker, fixtures
  and lock stay under `container-lab/`. The standalone lab page was removed.
- The browser container lab gains backendless bounded downloads and a
  real-data path: small pinned record assets (8 MiB bound) stream directly
  from the provider in the browser with pinned size and provider-MD5
  verification against the public inventory, and a real FOR-instance subset
  (first 20,000 points of SCION plot 39, CC-BY-4.0, provenance pinned in
  runtime-lock.json) runs through the WASI container for output-equivalence
  checks. Offline tests cover the native reference report, the MD5
  implementation (RFC 1321 vectors) and the download verification logic.
- Service and acquisition state now resolves from one configurable root:
  `CANOPY_STATE` when set, otherwise the checkout's `temp/`. Jobs, staging,
  locks and a new per-acquisition index (`acquisitions/index.json` with the
  canonical workspace path and its acquisition-status SHA256) live together
  under that root, keeping local workspaces locatable without scattered state.
- Added `class_semantics` to source profiles: native classification codes as
  evidence-backed, source-scoped data (FOR-instance v1, FOR-instance V2,
  FGI-EMIT). Validation now rejects a `ready` preparation without declared
  class semantics and duplicate or dangling codes; the published catalog shows
  a native class code table per source. The cross-source collision (class 2 =
  terrain in FOR-instance, building in FGI-EMIT) is asserted by tests.
- Dataset admission CI now also runs on pushes to `main` and manual dispatch,
  not only on pull requests.
- New daily `Pinned source drift` workflow checks that all pinned Zenodo
  records still publish the reviewed file names, sizes and checksums
  (`scripts/check_pinned_sources.py`, offline unit tests included).
- Catalog snapshots regenerate with a deterministic `generated_at`
  (`SOURCE_DATE_EPOCH`, otherwise the HEAD commit date) instead of wall-clock
  build time, keeping rebuild diffs reviewable.
- README gains a start-here flow overview and quick paths per audience.

## 2026-10-18

- Retired graph explorer, generic preprocessing controls, PLY inspector,
  benchmark runner, image registry and frozen Wytham diagnostic; public bundle
  entries removed rather than left as hidden runnable features.
- FOR-instance preparation packaged locally with audited masks and verified
  provenance; acquisition counts reorganized around verified original
  downloads.

## 2026-10-17

- Described FGI-EMIT multispectral measurements with scoped evidence; 19
  header-reviewed plots, bounded samples, unresolved calibration recorded.
- FOR-instance ETL contracts documented; redundant metadata exports removed.

## 2026-10-15

- Initial publication: ten pinned source records, search and comparison views,
  download service with checksum verification, reviewed dataset admission
  workflow and the schema-validated property graph (schema version 0.1).

## Browser container feasibility lab

- Added fixed, read-only LAS inspection in an upstream Python/Linux container running on WebAssembly/WASI.
- Verified the golden LAS in native Python, Node WASI and Firefox on a static local page.
- Added a public experimental workbench entry, immutable runtime hashes, explicit 1 MiB scope and six operation regression tests.
- Full source preparation, reproducible image builds and complete public Firefox file/export acceptance remain pending.
