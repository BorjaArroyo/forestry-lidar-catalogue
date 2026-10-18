# Content review · 17 October 2026

The current product focus is **individual-tree segmentation**. Other research
tasks are hidden from navigation, dataset task assessments and benchmark filters,
and retained as **TBD** in exported metadata. Source descriptions and native
attributes remain preserved. The complete task-discovery-download-transform
workflow is still work in progress.

This review corrects the existing ten-record catalog. It checked provider
descriptions, selected source READMEs, saved acquisition/conversion metadata,
the current converter, and existing execution evidence. It did **not** reread
all point clouds, certify annotation accuracy, resolve every license, reproduce
all article results, or admit a new dataset–pipeline–task combination.

The review was performed through documentation and code analysis. It is not a
human expert admission review. The ten legacy records remain partially audited.

## Product priority and current gap

The main workflow is: choose a task, discover compatible public sources, download
the selected inputs, and run an audited transformation into a chosen directory.
That complete workflow is **work in progress**. The current catalog, original
source downloads and legacy normalization are separate pieces. The frozen
Wytham reference is one verified copy operation, not completion of that workflow.
Benchmarks, article audits and image-registry expansion are secondary.

## What the catalog can honestly say

- **Reported by the source:** attributed descriptions of annotations, variables,
  acquisition units and published protocols, with links to the relevant source.
- **Saved local observations:** field names, counts, recorded hashes and known
  conversion behavior. Each profile binds these observations to the reviewed
  metadata snapshot. A matching snapshot does not establish current payload
  integrity or annotation correctness.
- **Unresolved:** missing or incomplete coverage, units, calibration, capture
  identity, exposure, rights or task-specific adapter evidence. Lack of evidence
  is distinct from a demonstrated incompatibility.
- **Execution evidence:** the precise inputs and operation that actually ran.
  A successful run does not by itself establish scientific validity.

Source task badges describe relevant source content. They do not approve use
for training or evaluation. No dataset in this snapshot has universal task
readiness. FOR-instance V2 is one native schema; it is not the hub's ontology.

## Corrections across the ten sources

| Record | Clarification | Still unresolved |
| --- | --- | --- |
| [FOR-instance](https://zenodo.org/records/8287792) | Live branches are not pure foliage; species fields vary across collections. | Collection lookups, masks and capture ancestry with V2. |
| [FOR-instance V2](https://zenodo.org/records/16742708) | Native terrain/wood/foliage labels do not make it a universal reference. | Scene lineage, coverage and selected-task compatibility. |
| [ForestSemantic](https://zenodo.org/records/15193973) | Tree and branch IDs repurpose LAS fields; zero normalized files reflects the derivative gate. | Plot locations were not independently verified here; intended-use review remains open. |
| [ForestSemantic-MS](https://zenodo.org/records/17172162) | Semantic components do not supply tree-instance reference. | Calibration, class collapse and geographic separation. |
| [FGI-EMIT](https://zenodo.org/records/19351234) | Its published training/test protocol differs from the local study's evaluation reservation. | Boundary/background policy, radiometry and checkpoint exposure. |
| [EvoMS](https://zenodo.org/records/15913427) | The provider cylinder split is different from reserving both labeled plots locally. | Cylinder overlap, preprocessing and model exposure. |
| [TreeScanPL10K](https://zenodo.org/records/19127709) | Species coverage is partial; cropped crowns and unknown species must remain explicit. | Taxonomic joins, scoring masks and campaign grouping. |
| [Four-site TLS](https://zenodo.org/records/16875688) | Spatial areas, complete plots and derived trees are different sampling units. | Shared captures, boundary policy and checkpoint exposure. |
| [LAUTx](https://zenodo.org/records/16910335) | Manual labels, two plot-label versions and automatic outputs have distinct roles. | No admitted versioned plot-reference adapter. |
| [Wytham trees/QSMs](https://zenodo.org/records/7307956) | Isolated trees and derived QSMs do not reconstruct complete scene reference. | Census/QSM linkage and independent structural reference. |

The existing forestseg study reservations remain in force for that study.
They are not restrictions universally imposed by the providers. In particular,
unlabeled data can be used by a published unsupervised training protocol while
being excluded from a different frozen local study.

## Transformations and the historical graph

The 13 registered relationships now distinguish inspected legacy code, a tested
label helper, missing adapters, recorded dependencies and unresolved transfer
functions. Each records input, output, ordered steps and preconditions.

Pseudocode describing the existing converter is not a validated task pipeline.
No speculative LAUTx adapter or calibrated spectral transfer is advertised as
implemented. The two-source instance helper has small regression tests; it does
not certify label quality, annotation coverage or source independence.

The graph retains its historical schema anchors. An arrow is not evidence that
one dataset becomes another, or that a model transfers between them. Recorded
matching chunk hashes identify a narrower evidence level than an order-invariant
geometry comparison. Neither authorizes deletion or canonical-copy selection.

## Benchmarks and articles

Only the frozen Wytham TreeLearn recipe has local end-to-end execution evidence.
It uses a checkpoint finetuned on all data and supports in-source diagnostics.
Its historical input preprocessing is not independently recovered. It does not
establish independent geographic accuracy or reproduction of a published score.

The generic TreeLearn evaluator and ForestFormer3D recipe remain disabled.
Their current entries contain documentation/code findings and links; a full
methods/results critique of their articles remains pending. Those findings must
not be presented as a completed article audit. Isolated Wytham tree exports
are no longer listed as full-scene evaluation reference.

## Maintaining this distinction

[knowledge-model.json](knowledge-model.json) is the curated authoring source.
[dataset-profiles.json](dataset-profiles.json) and
[relationships.json](relationships.json) are generated compatibility views.
The [data model](DATA-MODEL.md) describes typed references, JSON Schema validation
and the lossless storage migration. This does not change the reviewed content.
The builder combines them with acquisition metadata. Derived catalog and task
snapshots must be regenerated together. Historical observation claims are marked
stale when their reviewed metadata changes. Numeric findings come from the
supplied metadata, rather than fixed historical counts.

Before stronger scientific claims, review the selected scenes and variables:
annotation completeness, native meanings and types, coordinate units and datum,
capture/site lineage, rights for the intended use, exact preprocessing and
checkpoint/model-selection exposure. These are open evidence requirements,
not implied approvals or newly implemented capabilities.

## Sources-first presentation · 18 October 2026

Sources is now the entry point. Discovery summaries expose the data unit, reported
instance reference, coverage, preparation gap and a key limitation. Reference
availability is independent from pipeline readiness: no complete-source pipeline
is marked ready. The ForestSemantic derivative gate remains closed, and the
frozen Wytham reference copy remains a separate limited operation.

Filters and comparisons use those independent dimensions. Record download sizes
sum pinned provider assets; they do not estimate a ready-to-use task subset or
expanded storage. Historical local counts are shown only in workspace evidence.
Model-exposure and diagnostic controls remain in an explicit advanced disclosure.
No source payloads, source labels or scientific admission decisions changed.
