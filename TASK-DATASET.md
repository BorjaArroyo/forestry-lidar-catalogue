# Task dataset folders

The common index binds canonical task variables and reviewed source plans.
Extract the Workbench ZIP into a dedicated directory:

```text
dataset/
  dataset.json
  dataset-validation.json
  dev/zenodo-8287792/task-package.json
  dev/zenodo-8287792/plots/<scene-id>/00000.npz
  test/zenodo-8287792/task-package.json
  test/zenodo-8287792/plots/<scene-id>/00000.npz
```

Only selected, task-permitted partitions appear. Training excludes test scenes;
evaluation uses test scenes; inference may include both. Provider `dev` is never
silently renamed to `train`. No new validation split, common CRS or geographic
independence is inferred. Blocks are not spatial training tiles. Source adapters
retain their independently reviewed native reference policies.

## Load a partition

Install repository requirements and add `scripts` to `PYTHONPATH`:

```python
from knowledge_model import load
from task_dataset import TaskDataset

dataset = TaskDataset('/absolute/path/to/dataset', load())
dataset.validate()
for block in dataset.iter_partition('dev'):
    xyz = block['arrays']['xyz']
    # Supervised requests also expose instance and instance_valid.
    print(block['source_ref'], block['scene_id'], xyz.shape)
```

Complete validation is required before iteration. Source and scene scope must
stay with tree identities. Optional unavailable variables remain omitted.
The loader checks schema, task requirements, exact preparation plans, partition
folders, manifest hashes, scene uniqueness and all independently checked payloads.
It streams one block at a time without point-array conversion or imputation.

## Compose prepared subsets

Browser runs generate these folders directly. Existing prepared packages can be
composed without another download or point transformation:

```bash
python scripts/task_dataset.py export \
  --input /absolute/subset-a --input /absolute/subset-b \
  --output /absolute/new-dataset --use training

python scripts/task_dataset.py sample \
  --output /absolute/new-dataset --partition dev
```

Matching duplicate scenes are included once; conflicting duplicates, policies or
plans fail closed. The destination must be new. Interrupted native exports retain
an `.incomplete.json` marker; existing outputs are never overwritten. Validation
binds the dataset index, schema and reader hashes.

FOR-instance remains the only executable source profile. A persistent web list
for accumulating subsets is the next increment; the repeated native `--input`
option already composes prepared subsets. Common field shapes alone do not admit
cross-source semantic compatibility. Historical ZIPs keep their original layout.
