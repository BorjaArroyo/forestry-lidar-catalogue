# Multitask reference coverage

Reviewed: 2026-10-26. This is a source and contract analysis, not admission of a
new preparation route. Reference coverage must be configurable per preparation,
as confirmed by the maintainer during this review. No joint pipeline, payload
format, custom split or matching algorithm is implemented by this document.

## Cases in the current collection

Species classification, component segmentation and tree instance segmentation
have different targets. A native LAS `classification` field is not evidence of
species reference. Multiple sensor inputs do not by themselves create multiple
supervised tasks.

| Sources | Potential shared supervision | Evidence and present limit |
| --- | --- | --- |
| TreeScanPL10K | Point-level tree instances and tree-level taxonomy on the same plots | `treeID`, `treeSP` and crown completeness are documented. Companion tables establish partial taxonomic coverage, with unresolved discrepancies below. Neither task has an enabled preparation route for this source. |
| FOR-instance v1 | Instances and native components | Instance preparation is enabled. `treeSP` is not an established taxonomic reference and does not make this source a candidate for joint instance/species supervision. |
| FOR-instance V2 | Instances and terrain/wood/foliage components | The catalog records both references in observed PLY schemas. Species reference is not established. No enabled source preparation; v1/v2 capture ancestry remains unresolved. |
| EvoMS | Instances and wood/foliage/understory components | Both references are documented for two labeled plots; 18 other plots are unlabeled. No enabled source preparation or species reference established. |
| ForestSemantic | Tree and branch instances, components and structural references | Native IDs use dataset-specific LAS fields. Existing derivative and intended-use review remains outstanding; species supervision is not established. |
| ForestSemantic-MS | Component segmentation | Reviewed fields do not establish tree-instance or species reference. Spectral measurements are inputs, not additional reference targets. |
| FGI-EMIT | Tree instances with native spectral inputs | Instance preparation is enabled. Scene classes such as tree/building do not establish species or wood/foliage reference. |
| Four-site TLS | Tree instances and ground/tree semantic segmentation | The provider documents both point fields, not tree-species reference. Boundary trees can appear in several provider split folders. No enabled source preparation. |
| LAUTx | Versioned manual tree-instance reference | Automatic outputs are predictions, not a second independent reference. Species linkage and a versioned plot adapter are not established here. |
| Wytham Woods tree exports | Tree-level structural studies, subject to census/QSM linkage | Isolated XYZ clouds and QSMs do not establish complete scene segmentation or admitted species reference. Shared captures with Four-site TLS require grouping. |
| FOR-species20K and BioDiv-3DTrees | Taxonomy at different ranks | Classification preparation is enabled, with rank-specific validity. Isolated-tree identities do not establish complete scene-instance reference. BioDiv sensor pairs are separate observations, not automatically a fused cloud. |

The matrix uses the existing [knowledge model](../../data/knowledge-model.json),
[content review](CONTENT-REVIEW.md), [FOR-instance review](../sources/FOR-INSTANCE.md)
and [classification contract](../guides/TREE-CLASSIFICATION.md). These bounded
assessments do not establish that undocumented labels are absent from every
possible upstream table. The [Four-site TLS provider](https://zenodo.org/records/16875688)
explicitly documents ground/tree semantics and duplicated boundary trees.

## TreeScanPL10K: strongest documented candidate, unresolved joins

The [provider record](https://zenodo.org/records/19127709) and
[data descriptor](https://www.nature.com/articles/s41597-026-07269-1) describe
plot-local tree IDs and partial taxonomy. This already supplies a proposed
point-to-tree relationship within a source; it does not require cross-source
matching. The descriptor reports 272 plots and 10,417 trees, with 7,465 taxonomic
labels. These are provider-reported counts, not counts validated against LAZ.

This review downloaded only three companion tables, checked their advertised
sizes and MD5 checksums, and recorded SHA256 fingerprints in the
[metadata inspection](../../evidence/multitask-metadata-review.json). All CSV
rows and the workbook's 272 data rows were read. No point-cloud archive was
downloaded or newly audited.

| Measurement | Plot workbook | Individual-tree CSV |
| --- | --- | --- |
| Plots | 272 | 272 distinct `source_file` values |
| Trees | Sum of `n_trees`: 10,417 | 10,447 rows; unique `(source_file, treeID)` |
| Nonzero taxonomic code | Sum of `n_trees_with_species`: 7,465 | 7,468 rows |
| Unknown taxonomy | Difference: 2,952 | 2,979 rows with code zero |

The files actually published are `plot_summary.xlsx`,
`individual_tree_summary.csv` and `species_id_names.csv`. Record prose and some
existing catalog notes instead name `plot_summary.csv` and `species_id.csv`;
the paper also uses `ind_tree_summary.csv`. An adapter must pin actual assets
and schemas rather than assume those names are interchangeable.

Additional findings from the downloaded tables:

- Three Herby plot identifiers contain `2016` in the workbook and corresponding
  `2017` strings in the tree table. Exact key sets differ by six strings. Similar
  names do not authorize rewriting IDs or inferring the capture year.
- Of the 269 exactly shared plot keys, 20 have different tree counts; three of
  those also have different labeled counts. The evidence lists these separately
  from the three workbook keys with no exact tree-table match.
- All positive taxonomic codes resolve to the 30-entry lookup. Code 40 covers
  530 trees named `Quercus species` in the tree table and `Quercus sp.` in the
  lookup: genus reference, not species-level reference. One additional name
  variant is `Salix caprea L.` versus `Salix caprea`. Preserve native strings;
  any normalized taxonomy needs a reviewed, versioned mapping.
- The tree CSV lists 7,393 trees with nonzero taxonomy and a complete crown,
  75 with nonzero taxonomy and a cropped crown, 2,132 with unknown taxonomy and
  a complete crown, and 847 with unknown taxonomy and a cropped crown. These
  are table counts before rank checks, identity reconciliation or LAZ validation.
- The workbook has eight rows with acquisition dates in 2017 and eleven with
  a date interval instead of an exact day. Scanner strings include additional
  FARO 120 variants beyond the two models named in provider prose. Retain raw
  date precision and device names; review before normalizing them.

Before execution, reconcile both summaries with the actual LAZ files and verify
per-plot IDs, point counts, taxonomy consistency within each tree, crown flags
and joins. Code zero in `treeSP` combines unknown species and non-tree points;
use instance identity to distinguish them. Do not create a species class named
zero, discard unknown-species trees from segmentation, or equate crown
completeness with reference validity.

Rounded kilometer coordinates cannot certify fine spatial separation. A date,
interval or matching filename alone cannot establish same-state compatibility
for a new fusion. Preserve the provider's existing combined scans as supplied
representations; new combinations need their own reviewed lineage and route.

## FOR-instance v1 is excluded from the instance/species case

The [paper's Forest types section](https://arxiv.org/pdf/2309.01279), PDF page 5,
states that species reference was not published. A bounded follow-up inspection
on 2026-10-26 checked all seven support files against the existing source-lock
SHA256 values: the five tree tables contain DBH and identifiers, without species
columns or a code-to-taxon lookup. Headers and 2,048-point prefixes from all 32
LAS files confirm native `treeSP` fields and numeric codes in part of the archive;
the field description is only “tree species”. These observations establish no
mapping to taxonomic names and cannot estimate valid taxonomic coverage.

Consequently this source is excluded from the joint instance/species prototype.
Do not infer taxonomy from collection-level dominant species or shared field names.
Instances plus native components remain a separate, documented multitask case.

## Configurable reference policy and consumer contract

The preparation declares its required tasks and taxonomic rank, then a reference
coverage policy. Both modes must be supported by the design; this review selects
no universal default:

| Policy | Eligibility and outputs |
| --- | --- |
| Partial references allowed | Retain units useful for at least one selected task. Expose each target's independent validity and unavailable reason. A missing species label does not invalidate instance reference. |
| Joint references required | Identify units satisfying all selected reference requirements and show exclusions by reason. The recipe must state whether this selects target eligibility, extracted trees or scene samples; it must not silently remove scene context or relabel excluded trees as background. |

Coverage is measured over a declared unit and denominator, before and after
filters. Report point-level instance validity, tree-level taxonomy/rank validity,
their eligible intersection, crown completeness and unresolved joins separately.
Never multiply independent percentages to estimate their intersection. Genus-only
trees can satisfy a genus requirement but cannot satisfy a species requirement.

A future joint plot view needs explicit point and tree axes. The following is a
proposed consumer description, not a newly published package schema:

| Field | Shape / meaning |
| --- | --- |
| `inputs.xyz` | `[N, 3]` points; declared dtype, units and coordinate frame |
| `targets.instance`, `validity.instance` | `[N]` instance reference and validity under the pinned policy |
| `trees.key` | `[T]` unique release/plot/tree identities, retaining native IDs |
| `relations.point_to_tree`, `validity.point_to_tree` | `[N]` tree-table row indices and validity; valid links lie in `[0, T)`; background, unassigned and invalid-reference cases remain distinguishable |
| `targets.taxonomy`, `validity.taxonomy` | `[T]` rank-specific taxonomic reference, native code, vocabulary and unavailable reason |
| `provenance` | Source hashes, observation/capture identity, annotation version, recipe, exclusions and split assignment |

The concrete schema must declare every dtype, axis, sentinel and validity rule.
Sampling or extracting a tree is a recipe step. Storage chunks are not
automatically model samples. Do not implicitly broadcast tree taxonomy to points
or supply reference instance IDs as model inputs. No PyTorch implementation is
needed to make these boundaries clear.

Keep a common split assignment across task views and related observations.
Task masks and exclusions cannot move a tree or its derivative into another
partition. Resolve repeated captures and aliases before claiming profile C
generalization. Existing provider assignments remain provenance.

## UX implications and implementation order

1. **Objectives:** choose tasks and required rank. **Data:** show one source row
   with separate per-task reference coverage and preparation readiness. A source
   can contribute to both tasks without appearing as two independent datasets.
2. **Preparation:** show one contextual reference-coverage choice when several
   targets are requested. Explain its effect with coverage counts; keep raw code,
   lookup and join diagnostics in source details. Surface unresolved counts as
   unverified rather than advertising a prepared subset.
3. **Review:** summarize inputs, outputs, sample unit, policy, masks and exclusions.
   Distinguish same-sample supervision from a mixture of differently labeled
   sources. Combining independent segmentation and classification exports does
   not establish joint labels on any sample.
4. **Runs & outputs:** retain the exact policy, relationships and validated
   coverage. Multiple sensors, cross-source matching and fusion remain explicit
   representation decisions with their own evidence.

Current [discovery filtering](../../web/catalog/task-selection.js) separates
classification records through a source-level flag; the
[experiment data list](../../web/workspace.js) only offers enabled routes for
the active task. This can hide potential dual-use sources. The planned change
must use task-specific evidence for discovery and enabled pipelines for execution,
without treating one as the other.

First resolve TreeScan's bounded metadata discrepancies and audit its point/tree
joins. FOR-instance v1 is not a species candidate without new mapping evidence. Then
specify and validate the shared consumer contract and both coverage policies
before enabling a joint preparation. Instance-plus-component cases exercise
two point-level targets; taxonomy cases exercise different target dimensions.
These are complementary acceptance cases for extension to future tasks.
