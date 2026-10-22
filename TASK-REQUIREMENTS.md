# Task requests and audited preparation

Individual-tree segmentation now declares its requirements in the canonical
knowledge graph (model 1.4). A request selects a use and marks additional variables
as required, optional, or off. It does not introduce a new point transformation.

| Use             | Required arrays                     | Published partitions consumed |
| --------------- | ----------------------------------- | ----------------------------- |
| Training data   | `xyz`, `instance`, `instance_valid` | `dev` or `train`              |
| Evaluation data | `xyz`, `instance`, `instance_valid` | `test`                        |
| Inference data  | `xyz`                               | `dev`, `train`, or `test`     |

Sources explicitly reviewed as lacking suitable plot-instance reference are excluded when reference is required. They can remain inference candidates.

These are data-preparation uses. They neither fit a model nor reproduce an article
evaluator. The provider's partitions are retained. They do not establish independent
geographic zones, annotation completeness, or an adequate validation protocol.

## Required and optional measurements

Geometry is always required. Reference labels are required for supervised training
and evaluation; inference can omit them from its consumer view. Preparation still
preserves the complete original records and labels.

Multispectral reflectance is initially optional. The task describes a future
consumer contract with at least two spectral channels and separate measurement
validity masks. Native wavelengths and measurement descriptions identify source
candidates; executable admission additionally requires an audited pipeline that
produces the declared typed arrays. Display RGB cannot satisfy this requirement.

- Optional: keep the source eligible; record the variable as omitted when the
  admitted pipeline cannot produce it. Never fabricate channels or validity.
- Required: exclude sources without reviewed native support from this discovery
  view. Block execution unless an admitted pipeline produces the variable.
- Off: do not expose the variable through this consumer. Source records remain
  losslessly preserved in the underlying task package.

FGI-EMIT now has an audited three-channel adapter with native reflectance masks. It
supports geometry, conservative references and native uncalibrated channels. FOR-instance has an admitted geometry/reference
pipeline, so optional reflectance is omitted and required reflectance blocks it.
Unreviewed sources are not certified as lacking a measurement.

## Executable route

Choose a use and variables in Sources, inspect a matching source, and select
**Prepare data for this request**. The collection/partition selection restricts official
partitions for that use; individual plots are an advanced subset. Start preparation from the pinned Zenodo ZIP, a local ZIP,
or a complete local LAS.

The worker checks the pinned graph/schema and resolves the request before fetching
source data. It uses the unchanged audited source-specific producers, independently
validates every prepared block, and reads a real consumer block. Completion requires
both package validation and request validation. The ZIP adds:

- `task-plan.json`: exact use, required/optional choices, admitted output bindings,
  explicit omissions, permitted partitions, and reviewed-dependency fingerprint.
- `task-validation.json`: complete payload validation, eligible scenes/points,
  request fingerprint, and validator fingerprint.
- `browser-run.json`: runtime/intake evidence and consumer array types and shapes.

The optional local HTTP service enforces the same request before acquisition,
persists it in the job, rejects changed requirements/code on resume, and exports
the same task sidecars. Whole-archive preparation retains all scenes; the task
consumer only yields partitions permitted for the selected use. Acquisition without
preparation remains a separate original-data operation. Historical requests without
a task plan retain their original package-validation behavior.

## Independent use from Python

Install the pinned repository requirements. Validate and sample an exported
selection using its exact saved plan:

```bash
python scripts/task_plan.py sample \
  --package /absolute/prepared-selection \
  --plan /absolute/prepared-selection/task-plan.json \
  --allow-selection
```

`plan` resolves a request without processing data. `validate` reads every payload
block; `sample` first validates the package and then describes one consumer block.
A blocked plan returns a nonzero status. Saved plans are checked against the current
reviewed model; incompatible snapshots require the corresponding pinned checkout.

```python
from pathlib import Path
from knowledge_model import load
from task_package import TaskPackage, read_json
from task_plan import validate_prepared, iter_task_blocks

model = load()
plan = read_json(Path("/absolute/prepared-selection/task-plan.json"))
package = TaskPackage("/absolute/prepared-selection", allow_selection=True)
validate_prepared(model, plan, package)
for block in iter_task_blocks(model, plan, package):
    xyz = block["arrays"]["xyz"]
    # Training requests also expose instance and instance_valid.
    # Use the validity mask in the supervised loss; blocks are not spatial tiles.
    print(block["scene_id"], block["published_split"], len(xyz))
```

Add the repository's `scripts` directory to `PYTHONPATH` for these imports.
Partial iterator consumption is not whole-package validation. Identities remain
scoped by source and scene. Optional omissions are heterogeneous-source metadata,
not permission to combine unequal feature tensors in one training batch.

## Acceptance and remaining scope

The recorded browser acceptance downloads complete RMIT/train.las from Zenodo,
prepares 1,483,208 points, validates all six blocks, and reads float64 XYZ, int64
instances, and bool reference masks. The exported blocks are byte-identical to
the existing native reference. Native revalidation confirms the request and
permitted partition. An HTTP fixture covers download, extraction, preparation,
request validation, and resume. Required reflectance is rejected before acquisition.

See `evidence/task-driven-preparation-validation.json` for fingerprints and limits.
The original increment did not admit FGI-EMIT; its separately validated adapter is now available. Browser plans can combine both admitted sources. This does not certify quantitative
spectral conversion, or a model-specific training recipe. Those require their own
source policies, executable adapters, and complete validation.

## Plan version compatibility

New plans use schema `1.1.0` and `dependencies_sha256`. The
`task-source-dependency-closure-v1` binding includes the selected source and task,
all candidate pipelines for that pair, native source contracts, their recursively
referenced contracts/transformations/evidence, the source-task assessment, and the
model schema version. Complete dependency nodes are retained conservatively;
review and implementation changes invalidate the plan. Cross-source comparison
edges and unrelated tasks/sources do not belong to this execution binding.

Legacy `1.0.0` plans keep their original `model_sha256` check against the entire
graph. They are never silently upgraded. Unknown versions fail closed. A legacy
plan made stale by an unrelated edit still requires its matching checkout or an
explicitly regenerated plan. Runtime and validator fingerprints remain separate
provenance; scoped metadata binding does not grant permission to run arbitrary code.
