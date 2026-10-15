# Audited, self-contained dataset pipelines

Every data-changing pipeline must be analyzed and audited before it becomes
executable through Canopy. Dataset admission and pipeline admission are separate
human decisions. A shared field name or generic converter is not an approved
transformation. The legacy acquisition --harmonize path and the service's generic
normalization job are blocked. Existing derived data remains historical evidence,
not a newly certified pipeline result. Acquisition of originals and read-only
inspection/audit remain available.

## The admission unit

Approve one immutable pipeline package for one pinned source version and explicit
input contract. Any code, mapping, environment, input-schema or relevant source
change invalidates approval and requires reassessment. An executable package must
contain:

- A versioned manifest identifying provider record/version, metadata fingerprint,
  expected asset hashes and accepted field schemas, units, CRS and label meanings.
- The complete ordered transformation graph, including each step's analysis,
  intended task, assumptions, mappings, information loss, failure conditions and
  evidence. Review the composition too: individually valid steps may interact.
- Entrypoint, all scripts and mappings, locked dependencies and an immutable OCI
  image digest/platform, plus build/source provenance. Referenced configuration,
  models and ancillary resources must be included or checksum-pinned and staged
  before execution. No mutable latest tags, implicit notebook state, hidden host
  files, untracked downloads or unpublished manual steps.
- Exact input/output layout, resource needs and supported execution backend.
  Inputs are read-only; output goes to a new versioned directory. Source data
  need not be embedded in the image: the pinned input contract must identify it
  completely, and its use remains subject to the reviewed rights.
- Executable validation fixtures with expected results/tolerances, schema and
  semantic invariants, integrity checks, representative real-data validation,
  failure/recovery tests and the actual validation report.
- A human audit decision tied to the package digest, with reviewer, date, scope,
  evidence, limitations and intended-use restrictions. Status remains draft or
  blocked until the actual audit is complete; schema completeness alone never
  grants admission.

## Execution contract

The runner must verify package, image, inputs, mappings and required assets
against the audited digests, reject incompatible data before writing outputs,
and record an immutable run manifest with commands, versions, source hashes,
outputs, verification results and logs. Execution must need only the package,
its declared inputs, a chosen output directory and the documented backend.
Missing dependencies or unresolved audit conditions must block execution.
A dry-run curation plan is a proposal, not an executable or approved pipeline.

## Current delivery boundary

Generic normalization entry points remain closed. The first source-specific
prototype is pipelines/tls-exact-duplicate-index-v1: an offline exact-byte
duplicate-index validation package with a pinned input contract, prior analysis,
tests and package checksums. pipelines/registry.json records its evidence and
remaining blockers. It is not an execution registry and does not admit a pipeline.
The pinned container passes its synthetic tests and a real-data sample. Full
input consistency and human audit remain blocking requirements; see the evidence
for read-back hash discrepancies. The local image is not published to a registry.
The research converter module is retained as implementation material; importing
it directly is outside the audited Canopy execution workflow. Existing benchmark
recipes also remain disabled pending end-to-end validation.
