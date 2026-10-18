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

Nodes and edges are keyed objects; references resolve directly by ID. Duplicate
JSON keys fail loading instead of silently replacing entities. Evidence resources
are stored once. Contextual labels and claims stay at their point of use: sharing
a URL does not make two claims equivalent.

Every source-task pair has one explicit assessment, including undocumented and
unsupported cases. Native support and operational preparation stay independent.
`listing_order` and `conditional_order` retain existing display selections; a null
position means absent from that list, not scientific incompatibility.

Source identity is the version-specific Zenodo record. Concept-level dataset
families are not guessed from names. Versions, assets and acquisition observations
remain in their existing inventories, joined by record ID. Tree IDs stay scene-local.

Existing relationships retain their exact meaning. Historical FOR-v2 target links
remain legacy schema anchors, not declarations that a pipeline produces FOR-v2.
Contracts preserve code-inspection, helper-test, blocked and unresolved states.
These are qualified metadata relationships, not executable operations or proof of
transitive compatibility. Metadata cycles are allowed; no execution DAG is imposed.

## Validation and editing

JSON Schema validates closed entity shapes, required fields, types, dates and
controlled status values. `scripts/knowledge_model.py` additionally validates
reference existence and endpoint types, source/task identity, unique assessments,
shared evidence, display order, generated views and model/schema fingerprints.
This validates representation and consistency, not scientific truth. Review and
admission requirements continue to apply. Unknown model versions fail validation;
an incompatible change requires a versioned schema and explicit migration.

`dataset-profiles.json` and `relationships.json` are generated compatibility views.
`catalog.json` and `catalog.js` combine curated projections with saved acquisition
observations. Generated files support offline viewing and existing clients; the
graph is the single curated authoring source. The website consumes the same shape.

After editing the model, refresh presentation metadata without reading LiDAR:

```bash
python scripts/knowledge_model.py --export-views
python scripts/task_contracts.py --output knowledge-hub/task-dossiers.json
python scripts/knowledge_model.py
python tests/test_knowledge_model.py
```

Use the configured ingestion environment with the pinned dependencies. In the
public checkout, metadata files are at the repository root and the dossier output
path is `task-dossiers.json`. Export retains observation timestamps, counts and
acquisition provenance; it does not advance scientific review dates. Task dossiers
must be regenerated because they fingerprint the catalog.

Changed source membership requires the existing inventory-backed catalog build,
which also regenerates compatibility views. Publication and CI check schema,
references and graph/view consistency. Hand-edited compatibility views fail checks.

Migration projected all ten profiles, thirteen relationships and six tasks back
into the previous structures with equal values. Initial compatibility files are
byte-identical. This Canopy-specific profile does not claim DCAT, STAC, Croissant
or SSSOM conformance. Benchmark registries, pipeline packages and operational job
records retain their existing representations in this increment.
