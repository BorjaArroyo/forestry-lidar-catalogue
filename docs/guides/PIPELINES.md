# Dataset-pipeline-task compatibility

New datasets require prior analysis and dataset-specific pipeline validation
before catalog admission. Maintainers review that admission through a pull
request. A validated existing combination can run repeatedly without another
human approval. Material changes to source versions, schemas, label meanings,
transformations, task assumptions or environments require targeted reassessment
and validation of the affected parts, not a blanket restart of every audit.

## Current workflow

The current service acquires pinned records from the reviewed inventory and
prepares the FOR-instance v1 archive with its validated adapter.
It verifies transfer integrity and ZIP extraction and preserves original assets.
Other task transformations remain unadmitted. The source-specific normalization code
and policy have been removed from the application; their source remains in Git. They
do not make those outputs ready for instance-segmentation training or scoring.

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

FOR-instance has versioned contracts and a self-contained local pipeline
validated across the complete 32-plot archive. Source/output hashes, conservative
masks, native fields and split membership remain explicit. The 50 absent NIBIO2
entries prevent a claim of coverage of all 82 partition rows. Earlier TLS duplicate-index
and frozen Wytham diagnostic packages retain historical validation evidence in
the archive. Their scope does not admit raw-source task preparation, independent
accuracy or reproduction of a published score. They are not service operations.
