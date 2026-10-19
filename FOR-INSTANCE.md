# FOR-instance: archive-scoped plot-instance preparation

Record [8287792, version 1](https://zenodo.org/records/8287792) has a self-contained
local adapter for plot-level individual-tree reference. Validation evidence is
attached only after all 32 source plots and output arrays pass their checks.

## Exact scope

The provider-checksum-verified `FORinstance_dataset.zip` contains 32 LAS files and
seven support files. Its SHA256 is
`a1dfe3b8dab377a5a7cb74af47a6a6e0bef6664ae202c72112948d77ff97e1af`.
The complete source audit read 151,478,959 points, with no nonfinite XYZ, invalid
int64-compatible treeIDs or positive IDs outside tree classes. There are 298,612
points in tree classes without a positive identity.

The split CSV has 82 rows; 21 dev and 11 test rows match the archive. Its 50 NIBIO2
rows are absent from this exact archive, rather than omitted by acquisition. They
remain in every output package. This adapter claims complete coverage of the 32
archive plots, not of all 82 partition entries.

## Reference policy 1.0.0

| Native classification | Output instance | Reference validity |
| --- | --- | --- |
| 0 unclassified, 1 low vegetation, 3 outside plot | -1 | false |
| 2 terrain | 0 | true |
| 4 stem, 5 live branches, 6 woody branches with treeID > 0 | native treeID as int64 | true |
| 4/5/6 without a positive treeID | -1 | false |

This is a conservative Canopy reference policy. The paper explains that low
vegetation includes small unannotated trees and that outside-plot points should
remain available for inference while excluded from metrics. Native labels remain
unchanged. Terrain is the provider's reference, not a newly certified ground
classification. This policy does not reproduce an article-specific evaluator.
[Primary evidence, annotation and split sections](https://arxiv.org/pdf/2309.01279).

## Executable contract

```python
require exact reviewed archive membership, per-file sizes and SHA256
require unique provider dev/test join on relative plot path
copy each input to a private output-side snapshot
require snapshot size and SHA256, including independent read-back
for points in LAS chunks of at most 250_000 rows:
    require finite XYZ and finite integral int64-compatible treeID
    require classification in {0, 1, 2, 3, 4, 5, 6}
    reject positive treeID outside classes {4, 5, 6}
    instance = full(N, -1, dtype=int64)
    instance[classification == 2] = 0
    tree = isin(classification, [4, 5, 6]) & (treeID > 0)
    instance[tree] = int64(treeID[tree])
    instance_valid = instance >= 0
    save xyz_float64, instance, instance_valid, native_class, original_points
    verify exact array read-back and record chunk SHA256 and row offset
require complete per-plot point and class counts from the full source audit
verify decoded coordinates and masks independently from the stored native records
checkpoint only complete verified plots; write task-package.json after all pass
```

Read-back failures retry at most three times against unchanged expected hashes.
A persistent failure stops preparation. A completed output is verified before
reuse; interrupted matching packages resume at complete-plot boundaries. Other
existing destinations and changed package/input contracts are rejected.

## Coordinates, identity and partitions

All rows and complete native structured records are retained. LAS scales and
offsets decode XYZ as float64 without centering, voxelization, reprojection or
terrain-height normalization. Native dimension descriptors explain packed LAS
classification storage. Header CRS is retained: EPSG:25833 for three plots,
EPSG:25832 for twenty, EPSG:2193 for five, and unknown for four. XY units are
metres for the 28 projected headers; remaining units and vertical datum are not
certified. Optional collection-specific species fields are preserved, not mapped.

Positive tree identifiers are scoped by record and plot path. Published dev/test
membership remains unchanged. No training/validation split, independent-zone
claim or model-exposure assumption is introduced. Capture ancestry shared with
FOR-instance V2 remains unresolved.

## Run and inspect

The package under `scripts/for_instance/` includes the entrypoint, pinned source
lock, mask policy, exact requirements, package hashes and small regression tests.
It needs Python 3.11 plus its declared dependencies and the acquisition directory.
It does not need Ray, Kubernetes, a mount or hidden host configuration.

```bash
python scripts/for_instance/prepare.py --input /absolute/acquisition --output /absolute/new-instance-package
```

The output contains uncompressed NPZ chunks and `task-package.json`, with original
source hashes, output hashes, masks, native schemas, split membership, coverage
limits and recorded input verification attempts. No source is modified or deleted.
Allow space for lossless derived arrays plus the largest verified input snapshot.
The connected workbench offers this same command for already downloaded sources,
or after its pinned Zenodo download. Other source adapters remain TBD.
