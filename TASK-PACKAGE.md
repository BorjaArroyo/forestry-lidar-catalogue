# Tree-instance task package

The versioned output contract formalizes the existing FOR-instance preparation
without changing its producer, hashes, reference policy or stored outputs.
`task-package.schema.json` describes the manifest using JSON Schema 2020-12.
`scripts/task_package.py` independently validates binary arrays and provides a
bounded reader. It does not import the producer or call its reference function.
The array contract agrees with `contract:for-instance-plot-instances:1.0.0` in the
curated graph; a regression test checks that relationship.

## Profile and layout

Version 1.0.0 supports the reviewed FOR-instance archive, record 8287792, and
`for-instance-plot-instances:1.0.0`. Another source or reference policy requires
an explicit reviewed profile/version. This is not a universal class ontology.
The package has `task-package.json` and NPZ blocks under `plots/<scene-id>/`.
Original acquisition files remain separate and unchanged.

| Array | Type and shape | Meaning |
| --- | --- | --- |
| `xyz` | float64 [N, 3] | Native integer XYZ decoded using declared scales and offsets |
| `instance` | int64 [N] | -1 unknown reference, 0 audited background, positive native tree ID |
| `instance_valid` | bool [N] | True exactly where instance >= 0 |
| `native_class` | uint8 [N] | Source-specific native classification |
| `original_points` | native structured [N] | Complete original point records, including packed flags and extra dimensions |

Tree identities are scoped by source release and scene, not by storage block.
An instance may span blocks. Row offsets preserve original order and identify a
point within its scene. Blocks are not spatial tiles or independent training
examples. Positive IDs are never converted through floating point or renumbered.

Scene metadata retains source paths/hashes, CRS including null for unknown,
LAS scales/offsets, native schema descriptors, published dev/test membership,
class/reference counts and successful input-verification attempts. Unmatched
partition rows remain explicit. No units, datum, geographic independence,
annotation completeness or calibrated feature availability are inferred.
The original records preserve optional attributes; this profile does not yet
admit quantitative multispectral feature extraction.

## Independent validation

Install the checkout's pinned `requirements.txt`, then run:

```bash
python scripts/task_package.py validate /absolute/prepared-package
```

The validator checks the closed manifest schema, unique scene/chunk membership,
row continuity, native schema fingerprints, reviewed source/policy/package pins,
per-block SHA256, array types/shapes, finite decoded XYZ, integral int64 identities,
source-specific reference semantics and complete per-scene totals. Native LAS
classification bits are decoded according to the recorded point format.
The producer's local source lock and package lock are trusted inputs from this
checkout, never taken from the downloaded data package.

Success requires exhausting every scene. The JSON report binds its result to
manifest, schema, validator and producer-package hashes. A changed manifest is
rejected. This validates prepared-data consistency against the reviewed profile;
it does not reread original LAS payloads, independently certify every native
attribute against those payloads, or establish annotation quality. Checksums
establish integrity relative to the manifest, not authenticity of an arbitrary
replacement manifest.

## Consume a bounded block

```bash
python scripts/task_package.py sample /absolute/prepared-package
python scripts/task_package.py sample /absolute/prepared-package --scene SCENE_ID
```

The sample command reads one verified block and reports its scene, partition,
row offset, types and reference coverage. It never claims whole-package validation.
The reusable Python interface streams one block at a time:

```python
from pathlib import Path
from scripts.task_package import TaskPackage

package = TaskPackage(Path('/absolute/prepared-package'))
for scene_id, scene in package.scenes.items():
    for block in package.iter_scene(scene_id):
        xyz = block.xyz
        instance = block.instance
        reference_mask = block.instance_valid
        # Consume the same scene's ordered blocks without treating them as tiles.
        print(scene_id, block.published_split, block.row_offset, len(instance))
```

Arrays are read-only by default and loaded without pickle. Metadata is checked
on opening, each yielded block is verified, and whole-scene counters are checked
when its iterator finishes. Keeping only the first block is a bounded read, not
complete validation. Unknown-reference points remain available for inference;
the mask identifies valid reference, not an article-specific scoring protocol.
No framework, training split rewrite, resampling or normalization is introduced.

## Recorded acceptance

[evidence/task-package-reader-validation.json](evidence/task-package-reader-validation.json)
binds this implementation to complete metadata checks on the existing 32-scene
package and a real 250,000-point block. Sixteen contract regressions include
complete small native-fixture packages and an instance spanning storage blocks.
The report does not claim a new full read of all 151,478,959 prepared points.

## End-to-end service completion

The existing download-and-prepare action now chains verified acquisition, the
unchanged audited producer and complete independent prepared-package validation.
Jobs record separate downloading, preparing and validating phases. Completion
requires a successful validation report, whose SHA256 is retained in the job.
The workbench displays its scope and exports the report with execution evidence.
A validation failure leaves the job failed at that phase, even when preparation
itself returned success.

The offline HTTP integration test downloads a native LAS fixture ZIP, verifies
transfer and extraction, prepares two scenes, validates all outputs and resumes
without another download or rewriting completed blocks. A second check changes
a reference mask and its checksum after producer success and confirms completion
is blocked. These fixture checks do not claim a new full Zenodo acquisition.

[evidence/for-instance-e2e-validation.json](evidence/for-instance-e2e-validation.json)
records the HTTP fixture acceptance, validation gate, unchanged resume and its
explicit test boundaries, bound to the implementation hashes captured in that report.
The same HTTP acceptance verifies that the published container LAS/Python
assets are available and private job files cannot be fetched as static content.

## Explicit plot selections (1.1.0)

The browser adapter uses the same arrays and source policy with an explicit
selection descriptor: reviewed paths, available release-plot count, and a statement
that it verifies selected LAS files rather than the provider ZIP. Version 1.0.0
continues to require the complete reviewed release. Selections require explicit
`allow_selection=True` in Python or `--allow-selection` in the CLI; missing selected
scenes, unknown paths or false release counts are rejected. Validation reports
include `coverage` so selections cannot be mistaken for complete-release checks.
See BROWSER-PREPARATION.md and its dated evidence for the browser environment.
Earlier evidence files retain the implementation hashes captured on their dates.
