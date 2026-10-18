# Instance-segmentation MVP gates

The current product covers discovery, source comparison and verified original
downloads. The complete task-ready preparation workflow is **not finished**.

1. Complete the FOR-instance source audit: actual archive membership, full label
   ranges and conflicts, annotation coverage, coordinates and published split.
2. Resolve task masks from primary evidence. Preserve unknown reference, native
   fields and originals; do not mistake unlabeled small trees for known background.
3. Implement one self-contained, versioned FOR-instance adapter with pinned
   inputs, code, configuration and environment. Validate the complete combination
   on Ray, including recovery and output integrity.
4. Demonstrate the user path from source selection to task-ready files in the
   chosen directory. Keep preparation TBD until that path passes validation.
5. Record capture/site lineage and model exposure before claiming performance
   in other zones. An official dev/test split alone is insufficient evidence.

New sources require the admission review in CONTRIBUTING.md. Broader tasks,
graph exploration, article audits, benchmarks and image-registry integration are
deferred. Their experimental code and existing narrow validation evidence are
archived; they are not available operations in this product build.
