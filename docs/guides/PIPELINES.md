# Dataset-pipeline-task compatibility

New datasets require prior analysis and dataset-specific pipeline validation
before catalog admission. Maintainers review that admission through a pull
request. A validated existing combination can run repeatedly without another
human approval. Material changes to source versions, schemas, label meanings,
transformations, task assumptions or environments require targeted reassessment
and validation of the affected parts, not a blanket restart of every audit.

## Current workflow

The local service acquires pinned reviewed records, verifies transfer integrity
and ZIP extraction, preserves originals and prepares FOR-instance v1. Browser
preparation has admitted segmentation routes for FOR-instance and FGI-EMIT, and
classification routes for FOR-species20K and BioDiv-3DTrees. Admission is derived
from the canonical task graph; see [classification](TREE-CLASSIFICATION.md) for
its task-specific plan, observation and validation contracts.

Published splits remain unchanged. Custom experimental splits, new matching and
same-state fusion require the separate contracts and evidence described in the
[experiment workspace design](../design/EXPERIMENT-WORKSPACE.md). Retired generic
normalization code remains in Git and does not establish an admitted preparation.

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
