# Changelog

## Tree classification integration

- Integrate FOR-species20K and BioDiv-3DTrees with the common task catalogue, workbench, graph and installed CLI.
- Preserve native records, rank-specific references, published partitions and spatial audit findings; compress large audit inventories losslessly.
- Adapt and validate the contribution from PR #10 on top of PR #11 and PR #12.

## 2026-10-22 — Python 3.14 runtime

- Require Python 3.14 across the project, CI and the documented uv setup; every
  dependency then installs from wheels on Linux and macOS, matching the pinned
  Pyodide 314.0.7 browser kernel that already runs CPython 3.14.2.
- Raise numpy to 2.4.6 for cp314 wheels and exact version parity with the browser
  kernel; 2.2.6 publishes no cp314 wheels and would build from source.
- Move ruff to the py314 target, apply the PEP 758 unparenthesized except
  reformat, and refresh publication and runtime fingerprints for the touched files.
- Defer Python 3.15 until PyYAML and inflate64 publish cp315 wheels; building those
  from source today would contradict the all-wheels installation policy.
- Track uv.lock and AGENTS.md in git so the resolved environment and the shared
  agent instructions are reviewable.
- Add a real-browser kernel test that boots the pinned Pyodide 314.0.7 runtime
  and drives the audited FOR-instance preparation kernel end to end against a
  deterministic synthetic fixture package, independently validating every array
  without downloading the 1.6 GB provider archive.

## 2026-10-21 — Resumable Zenodo preparations

- Persist exact execution plans and independently validated plot checkpoints in
  browser storage; discover runs after reopening Workbench without tab state.
- Recheck versions and every saved payload before reuse; restart incomplete or
  corrupt plots and rebuild interrupted ZIPs after complete dataset validation.
- Separate Stop from Delete, retain checkpoints on failures and protect saved
  runs with exclusive locks. Keep local-input and historical output compatibility.
- Verify reopened-tab recovery in Chromium 155 and Firefox 158; both downloaded
  five-plot ZIPs pass native validation and match all 39 audited blocks.
- Recalculate remaining storage and preserve scientific producers and public
  plan/dataset contracts. Update the roadmap to reflect both admitted sources.

## 2026-10-21

- Combine admitted FOR-instance and FGI-EMIT subsets in one browser preparation
  and one partition-preserving ZIP, using existing audited source adapters.
- Document the Firefox macOS save-dialog workaround next to ZIP export; verify
  the downloaded Firefox archive against the independent reader and native blocks.
- Review and import version 2.0 combined plans with exact per-source plans,
  global storage estimates, explicit optional omissions and independent coverage checks.
- Validate mixed native packages, global preflight and second-source failures;
  preserve version 1.0 source-plan checks and existing single-source preparation.


## 2026-10-20 — Plan import, larger selections and FGI-EMIT admission

- Import strict saved plans, verify exact current dependencies, and restore selections only after validation.
- Validate four complete FOR-instance plots from three collections: 5,541,993 points, 24 native-equivalent blocks.
- Admit FGI-EMIT after both archive checksums, 19 LAS payload hashes and all 60,793,586 points passed audit and independent preparation validation.
- Add conservative source-specific references and three unchanged native reflectance columns with per-channel masks. Preserve official train/test and all original records.
- Retain explicit limits: no calibration/generalization certification, no interrupted-run resumption, and one source per browser plan.

## 2026-10-20 — Reviewable dataset execution plans

- Zenodo preparation now requires a versioned plan reviewed before payload intake.
- Bind exact subset/scene membership, overlaps, task requirements, source/pipeline
  versions and source/runtime pins; download the plan before execution.
- Reject stale or modified plans, invalidate changed selections and compare final
  coverage with the frozen plan alongside independent payload/folder validation.
- Keep source-byte, unknown network-volume and browser-space estimates distinct.
  Plan import/replay and resumable multi-source execution remain work in progress.

## 2026-10-20 — Increment 1: saved dataset subsets

- Added My dataset: append/remove reviewed subsets and retain selections and requirements in browser storage.
- Preparation uses the saved union, deduplicates overlapping scene selections and rechecks current source membership/pipeline availability.
- Changed requirements require explicit restoration or clearing; malformed saved drafts fail closed.
- Kept the existing audited producer, folder export and independent payload validation unchanged.

## 2026-10-20 — Loadable task dataset folders

- Added a versioned folder index binding canonical task variables and source plans.
- Browser exports preserve partition/source folders, independently checked packages and unchanged arrays.
- Added a bounded loader and composition of existing prepared subsets with strict deduplication and no overwrite.

## 2026-10-20 — Workbench prepares dataset selections

- Renamed the preparation workspace to Workbench.
- Collections and task-permitted partitions select the dataset; individual plots remain an advanced subset.
- Sequential browser intake produces one multi-scene manifest, complete independent validation and one ZIP.
- Preserved producer arrays, scene-local identities, native schema provenance and published splits.
- Verified the two complete RMIT scenes: 1,840,643 points and eight blocks. Full-release browser scalability and additional source adapters remain unvalidated.

## 2026-10-20 — Separate catalog selection from preparation implementations

- The preparation panel lists all reviewed sources and gates execution by task requirements, graph admission and the available implementation.
- Isolated FOR-instance implementation details from browser and local-service orchestration.
- Each browser run owns its worker and watchdog; failed or cancelled runs cannot terminate a later run.
- Split knowledge model IO, admission validation, projection and publication behind the existing CLI/import facade.
- Plan 1.1 binds the reviewed source/task dependency closure; legacy 1.0 keeps its original full-graph check.
- Producer code, independent reference validation and canonical catalog metadata remain unchanged.

## 2026-10-20 — Task requirements reach audited preparation

- Model 1.4 separates data use, minimum required variables and optional measurements.
- Discovery distinguishes native spectral candidates from executable output support.
- Browser and local service bind requests to the unchanged audited FOR-instance adapter, validate payloads and requests, and export their plans.
- The bounded consumer excludes published test scenes from training and never fabricates absent optional channels.
- Complete RMIT training-plot browser acceptance and native byte-equivalence are recorded; FGI-EMIT preparation remains TBD.


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
