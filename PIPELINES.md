# Dataset-pipeline-task compatibility

New datasets require prior analysis and dataset-specific pipeline validation
before catalog admission. Maintainers review that admission through a pull
request. A validated existing combination can run repeatedly without another
human approval. Material changes to source versions, schemas, label meanings,
transformations, task assumptions or environments require targeted reassessment
and validation of the affected parts, not a blanket restart of every audit.

## Current workflow

The current service only acquires pinned records from the reviewed inventory.
It verifies transfer integrity and ZIP extraction and preserves original assets.
There is no admitted task transformation. The source-specific normalization code
and policy remain historical evidence for interpreting existing exports. They
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

FOR-instance has versioned contracts and a disabled draft pipeline. Complete
source and output validation are still required. Earlier TLS duplicate-index
and frozen Wytham diagnostic packages retain historical validation evidence in
the archive. Their scope does not admit raw-source task preparation, independent
accuracy or reproduction of a published score. They are not service operations.
