# Linked instances and tree classification

Select both objectives to prepare references on the **same plot observations**.
Points identify their reference tree; species, genus and conifer/broadleaf labels
belong to that tree. Attention weights are model outputs, not source annotations.
These datasets can supervise a segmentation model with an auxiliary tree
classification head; no ForestFormer training implementation is included.

## Audited source scope

The versioned registry at `data/joint/source-lock.json` contains six completely
audited TreeScanPL10K clouds: 368,950,419 points and 238 plot-local trees. The
[source review](../sources/TREESCAN-JOINT.md) records the native evidence and
companion-table discrepancies. The remaining 266 provider plots are outside
this execution scope. This is not full-release browser scalability evidence.

Scientific admission remains explicit in the joint registry. A successful audit,
test or plan review cannot change its `admission` decision. Pending scopes can
be inspected and planned, but both the CLI and the browser worker block execution
until the maintainer authorizes the reviewed scope under CONTRIBUTING.md.
The four previously admitted single-task routes retain their graph admission.

## Configure and execute

1. In Objectives select both tasks and the classification target: species, genus
   or conifer/broadleaf. Every export retains all three label levels and masks.
2. In Data select complete audited plots. Crown filtering changes eligibility;
   it never deletes points, renumbers native IDs or turns excluded trees into background.
3. In Preparation explicitly allow partial references or require both targets.
   A genus-only tree can support genus/group classification without acquiring a
   species label. Unknown taxonomy remains unavailable.
4. In Review freeze and inspect the exact plan. Export/import binds the selected
   plots, policy, vocabulary, source hashes and execution dependencies. Changed
   choices require another review. No payload is downloaded during review.
5. Prepare from pinned provider ZIP ranges or the selected original LAZ files.
   Runs & outputs distinguishes transfer, preparation, independent checks and
   ZIP writing. Only successful validation exposes a completed ZIP.

Browser storage can be evicted. Downloaded ZIPs are the durable copy. Stop keeps
temporary files discoverable after reload; interrupted plots restart after a new
review. Delete is separate from Stop and cannot remove an active run. Saved ZIPs
are checksum-verified before a new download. Joint checkpoint resumption is not
claimed.

No reviewed provider split exists for these plots. Outputs remain `unassigned`.
Training/evaluation assignments require an explicit downstream experiment design;
the application does not infer geographic independence or generate a random split.

## Consumer contract

`dataset.json` uses `joint-tree-reference:1.0.0`. `dataset-plan.json` freezes the
request. NPZ blocks preserve native records and point order. The independent
reader checks every block against complete native-audit hashes, then checks XYZ,
instances, point/tree joins, labels, policy masks and total coverage.

| Loader output                                        | Axis  | Meaning                                                  |
| ---------------------------------------------------- | ----- | -------------------------------------------------------- |
| `arrays.xyz`                                         | N × 3 | Original scaled coordinates, float64                     |
| `arrays.instance`, `instance_valid`                  | N     | Native IDs, int64, and reference validity                |
| `arrays.point_to_tree`, `point_to_tree_valid`        | N     | Tree-table row; -1 when unavailable                      |
| `tree_arrays.species`, `species_valid`               | T     | Species vocabulary index and validity                    |
| `tree_arrays.genus`, `genus_valid`                   | T     | Genus vocabulary index and validity                      |
| `tree_arrays.leaf_group`, `leaf_group_valid`         | T     | Derived conifer/broadleaf group and validity             |
| `tree_arrays.taxonomy`, `taxonomy_valid`             | T     | Alias for the selected classification target             |
| `tree_arrays.instance_eligible`, `taxonomy_eligible` | T     | Frozen policy and crown selection                        |
| `trees`, `vocabularies`                              | plot  | Stable source/plot/tree keys, native labels and mappings |

Native zero instance IDs remain present with unavailable reference. The adapter
does not certify those points as background. All native records remain available.
Tree arrays stay plot-scoped when point blocks are sliced; missing reference is
never a new species or group. A group is not a taxonomic rank and does not mean
evergreen versus deciduous. The versioned GBIF-derived grouping covers only the
20 genera in this source lookup; it is not a universal botanical classifier.

```python
from canopy.loader import LoaderConfig, open_dataset

dataset = open_dataset("./dataset", LoaderConfig(block_points=65536))
dataset.validate()
for block in dataset:
    xyz = block["arrays"]["xyz"]
    tree_links = block["arrays"]["point_to_tree"]
    species = block["tree_arrays"]["species"]
    species_valid = block["tree_arrays"]["species_valid"]
    groups = block["tree_arrays"]["leaf_group"]
```

Reference instance links and taxonomic labels are supervision, not default model
inputs. If only LiDAR is available at inference, taxonomic conditioning of
attention must use inferred features/probabilities. Supplying held-out reference
species as inputs would change that experimental question.

Native CLI: `uv run canopy joint plan --plot NAME.laz --target species --policy partial --output plan.json`,
then `uv run canopy joint prepare --plan plan.json --input /originals --output /new-dataset`.
Validate an extracted export with `uv run canopy joint validate /dataset`.
