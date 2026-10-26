# Load a prepared dataset with Python and NumPy

Extract the completed ZIP into its own folder. Keep `dataset.json`, the
partition folders and provenance together. The same loader opens FOR-instance,
FGI-EMIT, FOR-species20K and BioDiv-3DTrees exports. Segmentation and classification
retain their separate validated formats; paired sensors remain separate observations.

## Install the reader

Use a compatible Canopy checkout, including its reviewed source metadata:

```bash
git clone https://github.com/BorjaArroyo/forestry-lidar-catalogue.git
cd forestry-lidar-catalogue
uv sync --frozen --extra classification
uv run python examples/load_dataset.py /absolute/path/to/extracted-dataset
```

Python 3.14 or later is required. The classification extra supplies native LAZ
decoding for independent validation. No Torch, TensorFlow or JAX is installed.
Run the downloaded example with `uv run python /path/to/load_dataset.py DATASET`
from the checkout. An incompatible reviewed contract is rejected; retain the
compatible checkout alongside an export used for reproducible research.

## Configure reading

```python
from canopy.loader import LoaderConfig, open_dataset

dataset = open_dataset(
    "/absolute/path/to/extracted-dataset",
    LoaderConfig(block_points=65536),
)
print(dataset.info)  # Available sources, partitions, fields and modalities.
dataset.validate()  # Complete independent validation, before reading any sample.
for block in dataset:
    xyz = block["arrays"]["xyz"]
    print(block["source_ref"], block["published_split"], xyz.shape)
```

`LoaderConfig` accepts `partitions`, `sources`, `fields`, `modalities`,
`block_points` and `copy_arrays`. None means all available values; unknown filter
names fail explicitly. Filters select existing membership and never create or
rename partitions. For example, use `partitions=("dev",)` only when `dataset.info`
lists `dev`; FGI-EMIT uses `train`, while classification may also contain `validate`.
Source references include `zenodo:8287792`, `zenodo:19351234`, `zenodo:13255198`
and `grodata:128035:1.0`. Modalities apply only to classification.

The first iteration also validates automatically if `validate()` has not been
called. Validation reads the complete export, even when consumer filters select
only one source. It may take time for large datasets. Subsequent iterations on
the same loader reuse that validation and verify every block read. Changed
metadata requires reopening and revalidation.

## Understand the returned block

- Segmentation returns `source_ref`, `scene_id`, `published_split`, `row_offset`
  and `arrays`. Supervised exports include `instance` and `instance_valid`.
  FGI-EMIT may also include `features` and `feature_valid`; missing optional
  channels remain absent. Selecting instances or features retains their masks.
- Classification returns `source_ref`, `tree_id`, `observation_id`, `modality`,
  `published_split`, `row_offset`, `arrays.xyz`, `taxonomy` and `reference_valid`.
  Taxonomy and validity are scalar per tree and rank. Null species reference
  stays null even when genus is known. Native taxonomy codes are not implicitly
  converted into contiguous model class indices.
- Native dtypes and point order are preserved. Arrays are read-only unless
  `copy_arrays=True` explicitly requests writable copies. `block_points` limits
  yielded slices; underlying validated storage blocks are still read in full.

Blocks are storage units, not independent trees, spatial crops or training
samples. A tree instance may span blocks. Keep source and scene with instance
IDs; keep physical tree identity when relating sensor observations. Grouping,
sampling, centering, dtype conversion, padding and augmentation are explicit
downstream decisions. Published partitions alone do not establish independence.
The loader never fills missing measurements, filters unknown-reference points,
merges paired sensors or silently rewrites splits.
