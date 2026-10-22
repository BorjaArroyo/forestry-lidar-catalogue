# Browser dataset preparation

The application prepares reviewed FOR-instance and FGI-EMIT selections in a module
worker. Pyodide executes the source-specific Python producer; independent package
and dataset readers validate every output before a ZIP is offered for download.
The browser runtime, scientific dependencies and local modules are pinned in
`browser-prepare/runtime-lock.json`.

## Supported workflow

1. Choose the data use and required, optional or omitted variables.
2. Choose an admitted source, collections and published partitions. Individual
   plots are available as an advanced subset.
3. Add subsets to the dataset draft. The draft persists locally across reloads.
4. Review the execution plan, or import a previously exported plan. The worker
   validates source membership, requirements and dependency fingerprints before
   downloading source payloads.
5. Prepare the exact reviewed selection. Sources and plots run sequentially;
   overlapping selections retrieve each plot once.
6. Download the completed ZIP. Browser storage is temporary and can be cleared
   by the browser or user.

The supported inputs are selected Zenodo ZIP members, a matching local provider
ZIP, or a complete reviewed local LAS. New sources and changed source releases
require admission; a file extension alone does not establish compatibility.

## Scientific guarantees

- Each selected LAS must match the reviewed size, SHA256 and native header.
- Native coordinates, original point attributes, row order, scene identities and
  published partitions are preserved. No normalization or resampling is applied.
- Source-specific classes, reference masks and missing-channel rules remain in
  the admitted adapters. Optional unavailable measurements are omitted.
- The producer does not validate its own reference semantics. The independent
  readers check all NPZ payloads, masks, metadata and array counts.
- Partial or invalid plots are never committed as reusable checkpoints.
- Partition labels do not demonstrate geographic independence, annotation
  completeness or cross-source radiometric calibration.

The ZIP follows the [task dataset contract](TASK-DATASET.md). Its provenance
includes the task request, execution plan, per-source validation, complete dataset
validation and runtime fingerprint. Validate an extracted ZIP independently:

```bash
canopy dataset validate /absolute/extracted-dataset
```

## Storage, interruption and recovery

OPFS stores staged inputs, prepared blocks, checkpoints and completed ZIPs. WORKERFS
exposes inputs and blocks to Python without loading an entire dataset into RAM.
The worker processes bounded blocks and releases staged resources sequentially.
Quota checks reserve space for preparation and ZIP export before source intake.

Stopping a Zenodo run preserves validated plots. Saved preparations are discovered
without depending on the current form or session storage. Resuming validates the
saved plan and every checkpoint again, then retrieves only pending plots. Invalid
checkpoints are discarded and rebuilt. A run lock prevents concurrent writers.

Each worker belongs to one run session. Cancelled or superseded workers cannot
change a successor's state. Local LAS/ZIP runs restart after interruption; completed
ZIPs remain downloadable. If dependencies differ, an interrupted run requires its
matching checkout. Its saved data is retained.

## Runtime and publication

The runtime uses explicit artifact URLs, byte sizes and hashes. Unpinned or changed
runtime artifacts are rejected. Pyodide import paths are configured once during
bootstrap. Source data stays in the browser; it is not uploaded to the local service.

The optional local service acquires complete pinned originals into a chosen
server-side directory. It is separate from browser preparation. Its loopback, token,
origin and publication-allowlist restrictions remain in force.

Refresh application fingerprints only after verifying a change:

```bash
canopy publication --write
canopy verify
```

Verification checks the fingerprints; it never regenerates them automatically.
External runtime pins and scientific evidence are not refreshed by this operation.

## Validation evidence

Routine Chromium and Firefox tests cover module loading below the project URL,
filters, comparison, requirements, partitions, draft persistence, real-worker
inspection and differentiated service errors.

[Five-plot preparation and native block comparison](../../evidence/combined-browser-expanded-validation.json)
and [browser process-restart acceptance](../../evidence/browser-reorganization-corrections-2026-10-22.json)
record independently validated outputs. Each record describes its exact code and
runtime. The [acceptance procedure](../../tests/browser_acceptance/README.md) uses
isolated profiles and compares all 39 prepared blocks with the native reference.

The WASI container prototype, generic normalizer and experimental small-asset
screen are not part of the application. Their source is available in Git history.

[Consolidated application acceptance](../../evidence/application-consolidation-validation-2026-10-22.json)
validates the current directory layout and CLI in both browsers. The five-plot
ZIPs contain 9,160,560 points and all 39 NPZ blocks match the native reference.
