# TreeScanPL10K joint-reference review

Reviewed on 2026-10-27. Source: [pinned Zenodo record 19127709](https://zenodo.org/records/19127709).
This is the original bounded technical review of two plots, authorized on 2026-10-27.
Four further plots were integrated following the maintainer request on 2026-10-28;
see the [expansion review](TREESCAN-EXPANSION-REVIEW.md). The current decision
and scope hash are in `data/joint/source-lock.json`; no independent human evidence
review is claimed.

| Complete cloud                 | Points     | Native positive tree IDs | Valid species labels |
| ------------------------------ | ---------- | ------------------------ | -------------------- |
| `Rem_Gorlice_2015_5804403.laz` | 33,103,057 | 10                       | 8                    |
| `Rem_Herby_2016_5603406.laz`   | 38,782,040 | 51                       | 24                   |

The audit read every point, checked integral nonnegative IDs and taxonomic codes,
binary crown flags, consistent code/crown values within each native tree across
all blocks, and exact positive-code lookup coverage. It records original LAZ
SHA256, native structured-record SHA256 and per-block XYZ/native hashes. Every
positive tree has an explicit point count; all 50,452,030 zero-ID points remain
preserved and masked as unavailable instance reference.

## Companion rows must not assign cloud labels

Both plots have matching tree counts between native clouds and the individual
tree CSV, but equal numeric IDs do not establish matching rows:

| Disagreement at the same numeric ID            | Gorlice plot | Herby plot |
| ---------------------------------------------- | ------------ | ---------- |
| Native species code versus CSV species code    | 4 / 10       | 32 / 51    |
| Native crown flag versus CSV crown flag        | 5 / 10       | 13 / 51    |
| Native tree point count versus CSV point count | 10 / 10      | 51 / 51    |

The preparation never transfers these CSV rows onto the clouds and does not infer
a permutation from similar point counts. It derives each tree row from the
cloud's native `treeID`, `treeSP` and `completelyInside` fields. The fingerprinted
`species_id_names.csv` maps the native code to its provider name. Each tree's
native code and name remain in the export; code zero is unknown. Code 40 is
`Quercus sp.`: valid genus/group, unavailable species. The original whole-source
summary count and three filename discrepancies remain unresolved outside this
bounded scope.

Conifer/broadleaf grouping is a separate derived attribute. Exact GBIF genus
matches, responses and URLs are retained in
`evidence/joint/leaf-group-taxonomy.json`. The source-scoped mapping distinguishes
Pinopsida and Magnoliopsida for these 20 tree genera. It does not infer leaf
persistence, normalize native species names or label unknown trees.

## Validation and limits

Native preparation and independent validation covered all 71,885,097 points and
289 blocks, preserving every original point record. The joint consumer keeps
point instances and tree labels on separate axes. Species reference is valid for
32 of the 61 native trees; genus and group reference are valid for 40.

The original ZIP central directories were inspected through bounded ranges;
selected member CRCs and complete LAZ hashes were checked. Whole provider ZIP
MD5 checksums were not checked. Geographic independence, complete annotation
correctness and coordinate datum are not certified.
No reviewed provider train/test split exists, so exports remain unassigned.

Chromium and Firefox automated acceptance uses an explicitly synthetic source
fixture through the real pinned Python kernel, native decoder, independent
validator, ZIP export and NumPy loader. It exercises unknown species, genus-only
reference, sparse IDs, group targets, reload and deletion. This does not turn the
synthetic fixture into source evidence or establish whole-release browser scale.

See [joint contracts and usage](../guides/JOINT-REFERENCES.md).

A persistent Chromium 156.0.8078.4 profile also prepared the complete Gorlice
cloud from its original local LAZ: 33,103,057 points, 10 trees and 133 blocks.
Independent browser validation passed and the 2,483,156,287-byte ZIP was hashed.
The recorded run took about 116 seconds. The first private-profile attempt
exhausted ephemeral storage; persistent-profile success does not guarantee every
browser quota. See `evidence/joint/browser-validation.json`.
