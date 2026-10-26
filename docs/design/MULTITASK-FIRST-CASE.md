# First instance and taxonomy design case

Status: design preview, 2026-10-26. No joint preparation is enabled.

## Source selection

Use TreeScanPL10K for the instance/taxonomy prototype. Its actual
`species_id_names.csv` supplies a code-to-taxon lookup. Its companion summaries
still disagree in totals and three plot identifiers; joint reference must be
validated against the clouds before execution. See the
[bounded metadata review](../reviews/MULTITASK-COVERAGE.md).

FOR-instance v1 is excluded from this case because no code-to-taxon mapping is
established; the reason is recorded in its [source review](../sources/FOR-INSTANCE.md).

## Concrete coverage preview

The [interactive prototype](prototypes/multitask-preparation.html) uses the
fingerprinted tree CSV from the [metadata inspection](../../evidence/multitask-metadata-review.json).
It reports metadata candidates, not independently validated reference coverage:

| Tree-table selection | Tree records | Nonzero taxonomic codes | Named-species candidates, excluding genus-only code 40 |
| -------------------- | ------------ | ----------------------- | ------------------------------------------------------ |
| All crowns           | 10,447       | 7,468                   | 6,938                                                  |
| Complete crowns only | 9,525        | 7,393                   | 6,867                                                  |

With both tasks and species rank selected, partial reference policy retains
10,447 records for potential instance supervision; joint policy restricts
target eligibility to 6,938 species candidates. The other 3,509 records lack
species-rank reference (2,979 unknown plus 530 genus-only). This does not remove
scene points, certify all instance reference, or resolve the conflicting workbook
total of 10,417. Genus rank and complete-crown filtering change the preview from
the same CSV, rather than multiplying marginal coverage percentages.

The policy is explicitly selected: the prototype chooses no universal default.
Changing it preserves targets, source and crown selection. Missing targets use
independent masks; requiring joint reference changes target eligibility without
turning excluded trees into background. With only one task selected, eligibility
is based on that task's reference requirements.

## Proposed consumer boundary

Consumer sample: one plot observation, containing N points and T linked reference
trees. Storage chunks are implementation units. Extracted-tree samples require
a separately declared recipe rather than an implicit change of granularity.

| Name                                           | Type and shape   | Rules                                                                                                                                |
| ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `inputs.xyz`                                   | float64 `[N, 3]` | Declare native coordinate frame and units; no implicit normalization.                                                                |
| `targets.instance`                             | int64 `[N]`      | Native positive IDs when valid; proposed sentinels 0 background and -1 unavailable require a source-specific reference policy.       |
| `validity.instance`                            | bool `[N]`       | Independent from taxonomic validity; no assumption that every native zero is reliable background.                                    |
| `trees.key`                                    | UTF-8 `[T]`      | Release + plot + native tree ID; unique in the view.                                                                                 |
| `relations.point_to_tree`                      | int64 `[N]`      | Index into the tree table; -1 means no valid link. Valid links lie in `[0, T)`. Reference relationship, never a default model input. |
| `validity.point_to_tree`                       | bool `[N]`       | True exactly for usable tree links; preserve background versus unavailable-instance reasons.                                         |
| `targets.taxonomy`                             | int64 `[T]`      | Indices into a declared rank-specific vocabulary; -1 when unavailable. Native code retained separately.                              |
| `validity.taxonomy`                            | bool `[T]`       | False for missing/unmapped reference and labels coarser than the requested rank.                                                     |
| `eligibility.instance`, `eligibility.taxonomy` | bool `[T]`       | Selection for the requested targets under the frozen coverage policy. Eligibility does not change scientific reference validity.     |
| `taxonomy_unavailable_reason`                  | UTF-8 `[T]`      | Declared values such as `unknown_native_reference`, `unmapped_native_code`, `coarser_rank`; empty when valid.                        |

Freeze target names, required rank, vocabulary, native mappings, source hashes,
coverage policy, crown filter, reference policy, sample unit and split membership
in the plan. Keep unknown native semantics unresolved; sentinels above are a
draft consumer proposal rather than new source facts. Preserve all source rows
and native identities unless an explicit, reviewed recipe declares otherwise.
Required targets with no verified support keep the plan unready even in partial
mode. This format is framework-neutral; no loader implementation is introduced.

## Navigation and acceptance

The prototype extends the selected experiment workspace: Objectives, Data,
Preparation, Splits and Review are distinct views. Sources and Runs & outputs
also have their own content. Context persists across local navigation; supported
host interaction state retains the task/rank/policy choices.

Data shows one source with task-specific coverage and preparation readiness.
Source evidence and crown filtering are contextual details. Preparation contains
the coverage policy and its effect on retained candidates. Review exposes the
expected input/output structure on demand, with execution blocked by unresolved
source counts, point/tree joins and pipeline admission. Splits explains the
shared assignment requirement and the unvalidated profile C objective; it
does not simulate a new splitting algorithm.

Review this navigation and the meanings of validity versus eligibility before
implementing a joint producer or changing the application's existing planners.
