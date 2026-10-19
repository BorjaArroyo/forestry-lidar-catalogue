# Curated knowledge model

`knowledge-model.json` is the canonical, editable representation of curated
source profiles, tasks, source-task assessments and dataset relationships.
`knowledge-model.schema.json` defines its JSON Schema 2020-12 structure.
This is a property graph serialized as JSON; no graph database is required.
Existing statements, limitations and task visibility are preserved. This storage
change does not introduce an ETL executor, change transformations or certify pipelines.

## Entities

| Entity | Identity | Contents |
| --- | --- | --- |
| Source release | `zenodo:<record-id>` | Curated profile of a particular published record |
| Task | `task:<key>` | Name, requirements summary, visibility and display order |
| Evidence resource | `evidence:<stable-id>` | Public URL or explicitly local document reference |
| Source-task assessment | `support:<record-id>:<task-key>` | Source/task references, support, rationale and display positions |
| Dataset relationship | `relation:<stable-id>` | Source references, applicable task references, evidence and existing contract |
| Data contract | `contract:<name>:<version>` | Fields, types, shapes, annotations, invariants and coordinate reference |
| Measurement channel | `channel:<source-scanner>:<version>` | Source-scoped sensor, wavelength, calibration state and evidence |
| Coordinate description | `coordinates:<name>:<version>` | Shared frame information, unresolved units/datum and evidence |
| Transformation | `transformation:<name>:<version>` | Input/output relationships, precise rules, implementation fingerprint, limits and review state |
| Pipeline specification | `pipeline:<name>:<version>` | Source, task, selected asset and ordered transformation references |

Nodes and edges are keyed objects; references resolve directly by ID. Duplicate
JSON keys fail loading instead of silently replacing entities. Evidence resources
are stored once. Contextual labels and claims stay at their point of use: sharing
a URL does not make two claims equivalent.

Every source-task pair has one explicit assessment, including undocumented and
unsupported cases. Native support and operational preparation stay independent.
`listing_order` and `conditional_order` retain existing display selections; a null
position means absent from that list, not scientific incompatibility.

Source profiles may declare `class_semantics`: the source's native classification
codes as evidence-backed data (`code`, `term`, `evidence_ref`). Codes are scoped
to their source — FOR-instance class 2 is terrain while FGI-EMIT class 2 is
building — and a preparation admitted as `ready` must declare them, so class
collisions between sources are checked by validation rather than read in prose.

Source identity is the version-specific Zenodo record. Concept-level dataset
families are not guessed from names. Versions, assets and acquisition observations
remain in their existing inventories, joined by record ID. Tree IDs stay scene-local.

Existing relationships retain their exact meaning. Historical FOR-v2 target links
remain legacy schema anchors, not declarations that a pipeline produces FOR-v2.
Contracts preserve code-inspection, helper-test, blocked and unresolved states.
These are qualified metadata relationships, not proof of transitive compatibility.
Metadata cycles remain allowed. Pipeline descriptions additionally require
connected input/output contracts in their declared order; this introduces no executor.

[FOR-instance](FOR-INSTANCE.md) has a validated direct archive-to-task pipeline.
Its inspected historical conversion remains a disabled evidence branch. The
[FGI-EMIT measurement review](FGI-EMIT.md) adds a native contract with 39 typed
fields and three source-scoped sensor channels. Its preparation stays TBD.
Code inspection, bounded measurement observations and execution admission retain
distinct states. Data-flow edge roles are `describes`, `consumes`,
`produces` and `designed_for`; the last records intent, not scientific admission.

## Validation and editing

JSON Schema validates closed entity shapes, required fields, types, dates and
controlled status values. `scripts/knowledge_model.py` additionally validates
reference existence and endpoint types, source/task identity, unique assessments,
shared evidence, display order, generated views and model/schema fingerprints.
It also checks versioned contract/operation identities, typed data-flow endpoints,
operation ports, pipeline composition and pinned local evidence/code artifacts.
This validates representation and consistency, not scientific truth. Review and
admission requirements continue to apply. Unknown model versions fail validation;
an incompatible change requires a versioned schema and explicit migration.

`catalog.json` and `catalog.js` combine curated projections with saved acquisition
observations. They support API/HTTP and offline viewing respectively. The graph
is the single curated authoring source. Redundant `dataset-profiles.json` and
`relationships.json` exports and their regeneration code have been removed;
their views are computed in memory. The website consumes the same catalog shape.

After editing the model, refresh presentation metadata without reading LiDAR:

```bash
python scripts/knowledge_model.py --export-views
python scripts/knowledge_model.py
python tests/test_knowledge_model.py
```

Use the configured ingestion environment with the pinned dependencies. In the
public checkout, metadata files are at the repository root. Export retains
observation timestamps, counts and acquisition provenance; it does not advance
scientific review dates. Retired experimental dossiers are not generated.

Changed source membership requires the existing inventory-backed catalog build,
which projects the graph into the catalog. Publication and CI check schema,
references, evidence/code pins and graph/catalog consistency.

Version 1.0 preserved the original ten profiles, thirteen relationships and six
tasks. Migration to 1.1 retains the source profiles and tasks, adds the ETL
description types, replaces the obsolete FOR-v2 anchor and removes redundant
exports. Version 1.2 replaces the unimplemented FOR-instance 0.1 draft with a direct
source-to-task 1.0 adapter. Execution flags can be enabled only with validated
status, resolved rules, pinned code and local validation evidence. An enabled
pipeline must contain enabled transformations; a ready source badge must resolve
to one enabled instance pipeline. Publication also verifies package artifact
hashes and the validation report binding to code and package. Version 1.3 adds optional typed field measurements, measurement-channel nodes and
pipeline input requirements. Existing observation snapshots and FOR-instance
execution/code evidence are retained. The current schema requires version 1.3; unknown versions fail instead
of being interpreted through an old shape. This Canopy-specific profile does not
claim DCAT, STAC, Croissant or SSSOM conformance. Experimental benchmark registries and execution packages are archived outside the
current application. Original-download jobs retain their durable job records.


## Measurement descriptors and input requirements

Native contracts keep geometry, reference labels, provenance, display fields and
quantitative measurements separate. Each measurement names a shared channel,
quantity, semantic status, unit with explicit unknown state, documented sentinels
or unspecified missingness, association method/distance/status and evidence.
Calibration belongs to the source-scoped channel; sharing a wavelength is not a
cross-source calibration assertion. Validated calibration or association requires
pinned local validation evidence.

FGI-EMIT intensity/amplitude zero is missing measurement data. Reflectance zero
can be numerically valid while -9999 is its sentinel. The reference tree_index
zero has a different meaning. Pseudo RGB has conflicting source descriptions and
remains display data. Native units, scaling and missingness are never guessed
from field names. Headers and bounded prefixes do not certify whole-source
availability or physical alignment.

Optional pipeline input requirements refer to fields of the input contract, with
purpose, unit, missingness policy and calibration/association requirements. An
enabled feature declaration must resolve to a typed measurement with documented
semantics and missingness; requested units and validation states must match.
A null requested unit means no physical-unit constraint is asserted, not unitless
or cross-source compatibility. Draft requirements may retain unmet conditions;
this does not enable their execution. Runtime validity masks and availability
checks remain the responsibility of an audited implementation.

The existing source-detail panel and exported catalog project native measurement
contracts and their channel descriptors from graph references. They are derived
views, not additional authoring files. Public evidence includes its bounded scope
and inspector fingerprint; full source/adapter validation remains separate.

## Executable task-package contract

The [task-package contract](TASK-PACKAGE.md) formalizes existing FOR-instance
1.0 outputs with `task-package.schema.json` and an independent binary validator
and streaming reader in `scripts/task_package.py`. A regression check binds the
reader's array types/shapes to the existing graph output contract. Schema checks
do not replace payload checks or scientific admission. This increment changes
neither the curated model version nor the producer's pinned execution package.
