# FOR-instance original: data and transformation contracts

This describes record [8287792, version 1](https://zenodo.org/records/8287792)
for plot-level individual-tree segmentation. It is a metadata specification, not
an executable or admitted task pipeline. The canonical description is in
`knowledge-model.json`; bounded observations are in
[evidence/for-instance-v1.json](evidence/for-instance-v1.json).

```mermaid
flowchart LR
    A[Native LAS plot contract] --> B[Existing normalization: code inspected]
    B --> C[Legacy NPZ contract]
    C --> D[Task masks and split attachment: proposed]
    D --> E[Proposed plot-instance package contract]
```

The three data contracts, two transformations and pipeline specification have
separate versioned identities. Contracts share one coordinate-description node.
The old direct FOR-v1 to FOR-v2 projection link has been removed: the task output
is a plot-instance representation, not the FOR-v2 dataset.

## Inputs and observations

The pinned inventory selects `FORinstance_dataset.zip`, with provider MD5
`01fd03ba4068648e21fb4591fbff34c4`. The acquisition manifest records 32 LAS plots
and seven support files. The review on 2026-10-18 read all 32 LAS headers and
five prefixes of 2,048 points, one per observed dimension schema. The inspected
prefixes total 10,240 points; they are not a random sample or a full annotation
audit. Recorded LAS hashes were retained as acquisition provenance, not recomputed.
The readme and split CSV bytes matched their recorded SHA256 checksums.

| Native field | Representation | Meaning and limits |
| --- | --- | --- |
| X, Y, Z | int32 storage | Decode each axis with its LAS scale and offset; preserve row order |
| treeID | int32 in 28 plots; float64 in four | Plot-local identifier; all floating values still need finite/integral/range validation |
| classification | LAS five-bit dimension | Provider annotation classes below; do not interpret packed raw records as an ordinary classification column |
| treeSP | int32 where present | Absent in four plots; collection-specific lookup review pending; optional for this task |

Header CRS values were EPSG:25833 in three plots, EPSG:25832 in twenty,
EPSG:2193 in five, and absent in four. The projected CRS establish XY metre
units for the 28 identified files. Vertical units/datum and the four missing CRS
remain unverified. No reprojection or terrain-height normalization is specified.

The archive readme defines classification codes:

| Code | Meaning |
| --- | --- |
| 0 | Unclassified scattered points not annotated |
| 1 | Low vegetation: not a tree or ground |
| 2 | Terrain |
| 3 | Trees outside measured/annotated plots |
| 4 | Stem |
| 5 | Live branches / green crown; not a pure foliage label |
| 6 | Woody branches |

## Published partitions and scope discrepancy

`data_split_metadata.csv` contains 82 entries. Exact path joining matches all
32 acquired LAS files: 21 development and 11 test. The remaining 50 CSV entries
refer to NIBIO2 files absent from the acquired manifest. This is an observed
scope discrepancy; its cause is unresolved. It does not establish whether the
provider archive or the acquisition process caused it.

The specification retains those unmatched rows explicitly. It does not silently
discard them, invent missing clouds or claim full-source coverage. Development
data may be subdivided for training/model selection under a recorded protocol;
published test membership is preserved for final evaluation. Neither directory
names nor the published split establish independent geographic sites. Capture
ancestry shared with FOR-instance V2 also remains to be reconciled.

## Existing transformation and proposed output

The existing normalizer preserves decoded XYZ and original structured records,
initializes instances to -1 and retains positive native treeID values. It leaves
the coarse semantic array unknown and the split unassigned. Its precise rule and
implementation SHA256 are recorded in the graph. This describes inspected code;
it does not certify full task compatibility or current stored chunks.

The proposed task output retains XYZ, native records and row order, with an
int64 instance array, boolean validity mask, published split and a versioned mask
policy. Unknown/excluded points use -1, known non-tree points use 0, and positive
tree identities remain plot-local. A complete package must also retain native
dimension descriptors needed to unpack classification from LAS records.

Draft rules exclude classes 0/3 from reference and map terrain to background.
Tree classes 4/5/6 retain a positive treeID where available. Low-vegetation policy,
boundary treatment, conflicting class/ID combinations and numeric ranges still
require full-scope review. These proposed rules are not adopted as ground truth.
All graph transformation and pipeline execution flags remain false.

The metadata validator checks typed endpoints, operation inputs/outputs, ordered
contract composition, versioned identities and pinned code/evidence files.
It validates the description, not the LiDAR payload or scientific suitability.
