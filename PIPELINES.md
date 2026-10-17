# Dataset-pipeline-task compatibility

New datasets require prior analysis and dataset-specific pipeline validation
before catalog admission. Maintainers review that admission through a pull
request. A validated existing combination can run repeatedly without another
human approval. Material changes to source versions, schemas, label meanings,
transformations, task assumptions or environments require targeted reassessment
and validation of the affected parts, not a blanket restart of every audit.

## Existing workflows

Source-aware acquisition, integrity verification and normalization already exist.
`normalization-policy.json` records the previously observed source IDs, schemas
and known limitations. This preserves historical workflow scope; it does not
retroactively certify labels, rights or benchmark suitability. Known combinations
are enabled. New sources and unknown field schemas are blocked until analyzed.
The deferred derivative-rights source remains deferred. Each input is copied to
a verified local temporary snapshot before conversion, and originals are preserved.
The existing acquisition --harmonize option uses the same compatibility controls.
No per-execution human approval is required.

## New dataset admission

Record the pinned provider version and asset hashes, variables/types, units,
coordinate references, labels, coverage, rights, duplicates and intended tasks.
Analyze every proposed transformation and its composition: assumptions, mappings,
information loss, validation, failure modes and task consequences. Validate the
complete dataset-pipeline-task combination before publishing it as compatible.
A shared file extension is not evidence of compatible semantics.

New executable packages must include their entrypoint, ordered steps, mappings,
locked dependencies, immutable environment/platform, input/output layout, required
assets, resource needs, fixtures and representative validation evidence. Execution
must need only declared inputs, package, backend and chosen output directory.
No hidden host state, mutable image references or unpinned downloads are allowed.
Record package/configuration/input/output hashes and logs for each run. Hash or
compatibility failures block execution regardless of prior successful validation.
Unresolved semantic or rights decisions require expert review; automated success
alone does not grant a new intended use.

## Current readiness

TLS exact-duplicate index is technically validated for its existing 236-file
subset using verified local snapshots. Its CLI can validate without a new human
approval; its Workbench adapter is not implemented and its local image is not
registry-hosted. Read-back failures remain documented; WebDAV's cause is not
certified. The package proposes candidate groups only, with no deletion or
canonical selection. New curation operations and changed semantics still need
specific analysis. The frozen Wytham TreeLearn recipe has verified Ray execution for its pinned diagnostic export only. Generic TreeLearn and ForestFormer3D recipes remain disabled. Successful execution does not certify independent accuracy or reproduction of a published score.
