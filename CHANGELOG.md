# Changelog

Notable changes to the catalogue, the knowledge graph and its validation
contracts. The graph's `schema_version` gates structural migrations; presentation
and tooling changes are listed here without a version bump. Follows
[Keep a Changelog](https://keepachangelog.com/) and uses date-based entries.

## 2026-10-19

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
