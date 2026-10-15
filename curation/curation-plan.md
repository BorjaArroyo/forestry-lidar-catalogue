# Curation review plan

Status: pending human review. No curation applied.

Manifest files: 15,400; metadata-only analysis (source-size checks are recorded separately).
Source duplicate groups (including support files): 123; normalized duplicate groups: 398.
Connected identity groups: 398; evidence consistency/file errors: 0.

## Review actions

- split_overlap (118): Review identical-cloud groups spanning split-named folders. Folder names are hints, not a certified benchmark protocol.
- identity (398): Review connected source/derivative identities; keep each accepted identity in one split. Do not choose a canonical copy automatically.
- site (5,626): Resolve physical sites/captures before certifying site-out evaluation.
- split (5,626): Define a task-specific split protocol after identity and site review.
- crs (5,598): Verify units, CRS and height reference before spatial alignment; never infer them from bounds alone.
- rights (3): Keep deferred derivatives blocked until intended-use rights are reviewed.

## Scope

Hashes are recorded evidence, not current payload verification. No near-duplicate geometry, annotation correctness, full license review or automatic deletion. This report does not authorize execution.

All proposed canonical paths remain unset. Consult the JSON for member paths, manifest fingerprints and evidence conflicts.

## Source-file check result

All 15,400 recorded source files were checked for presence and expected size; zero errors were found. The manifest/checkpoint fingerprint matches this metadata plan. See file-check-summary.json. Payloads and normalized chunks were not rehashed; same-size corruption is not excluded. No correction was applied.
