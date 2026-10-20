# Browser preparation: FOR-instance plot selection

The Download & prepare view runs a fixed, bounded Python adapter in a module
Web Worker using Pyodide 314.0.7, Python 3.14.2, NumPy 2.4.6 and laspy 2.7.0.
It reuses the unchanged audited producer's reference policy and native schema
functions. The browser environment is distinct from the pinned native environment;
its evidence does not admit all datasets or all plot schemas automatically.

## Workflow and data contract

1. Select a complete LAS, a local ZIP, or a reviewed plot to retrieve from the
   pinned Zenodo ZIP using byte ranges. Archive modes extract only the selected
   member. Size and streamed LAS SHA256 must match exactly one reviewed plot
   in source-lock.json.
2. WORKERFS exposes the File read-only without copying the entire input into RAM.
   laspy reads at most 250,000 points per block. The adapter writes one NPZ in
   MEMFS, waits for its OPFS write, then removes it before producing the next block.
3. The original native integer coordinates/attributes and row order are retained.
   float64 XYZ, int64 IDs and conservative unknown-reference masks match the native
   policy. There is no filtering, normalization, renumbering or partition rewrite.
4. The independent TaskPackage validator reads every stored NPZ through WORKERFS,
   including all class/reference counts. Completion requires this validation.
5. zip.js 2.20.0 writes a ZIP64 archive incrementally to OPFS. The download link
   exposes that File without assembling the complete archive in a JavaScript array.
   Export it using the browser's normal download dialog, then clear temporary output.

The manifest uses schema version 1.1.0 with an explicit selected-path list, the
number of available release plots, and the fact that this run did not verify the
provider ZIP. It is complete for the selected plot, not for all 32 release plots.
The normal complete-release validator rejects a selection by default. To validate
an extracted browser ZIP explicitly:

```bash
python scripts/task_package.py validate /absolute/extracted-package --allow-selection
```

The runtime lock also pins the provider URL, archive size/checksum metadata and
ZIP-intake implementation. The archive checksum is provenance, not a claim that
this selective run verified the whole ZIP. The runtime lock pins SHA256 and size
for the loader, WebAssembly, standard library,
Python package dependency closure, zip.js, adapter, independent validator, schema
and trusted producer profile. External executable scripts are verified before import;
runtime/package fetches reject unpinned URLs. Source data is never uploaded. The
browser-run.json report records the actual runtime and lock fingerprint.

## Storage, failure and lifecycle

Preflight checks reserve space for both chunks and ZIP export plus a margin. OPFS
quota is an estimate, not a guarantee; later write errors remain possible. Writes
are sequential with exclusive file handles, and each run has a unique directory
and Web Lock. Cleanup refuses an output currently in use by another page.

Keep the tab open while preparing. Cancellation terminates the worker and removes
that run's temporary data. Failed runs attempt the same cleanup. Completed exports
can be recovered in the same tab after reload; interrupted plots restart rather
than pretending to resume partway. Browser eviction/clearing can remove OPFS, so
it is not a permanent dataset destination. Starting another plot replaces the
panel's prior temporary output. The runtime fetch has a two-minute timeout and
the UI stops a worker after three minutes without progress.

Firefox needs no showDirectoryPicker/showSaveFilePicker support. This path uses
OPFS plus an ordinary ZIP download. Optional whole-archive service jobs remain
separate and preserve their existing native execution behavior.

## Acceptance and boundaries

[evidence/browser-preparation-validation.json](evidence/browser-preparation-validation.json)
records Firefox 157 on macOS preparing the complete RMIT/test.las (12,153,263 bytes,
357,435 points) into two NPZ blocks. The browser wrote and independently validated
both blocks, then produced a 24,324,161-byte ZIP. A test-only loopback capture
saved the generated ZIP for native validation: every array, dtype and NPZ byte
matched the native adapter output. The fixture was supplied as a File by a local
acceptance page; OS file-picker/save-dialog automation was not completed.

This is not a full-release browser audit, throughput or peak-memory benchmark.
The later expanded acceptance below covers CULS as a second native schema.
Remaining plots/schemas still need additional browser acceptance.
The whole provider ZIP is not downloaded or verified here. One member can now
be retrieved/extracted as described below. LAZ is unsupported, and partial plot
processing does not resume across page closure. The separate small-asset
Zenodo downloader remains bounded to 8 MiB. Annotation correctness, geographic
independence, full-archive authenticity in this run and benchmark reproducibility
are not established by prepared-data validation.

## Primary references

- [Pyodide file systems](https://pyodide.org/en/stable/usage/file-system.html)
- [Pyodide package loading](https://pyodide.org/en/stable/usage/loading-packages.html)
- [Emscripten WORKERFS](https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs)
- [zip.js and ZIP64 streaming](https://gildas-lormeau.github.io/zip.js/)
- [OPFS synchronous access](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
- [Browser storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

The earlier container2wasm experiment is historical; see BROWSER-CONTAINERS.md.
It is no longer loaded by the workbench.

## Selective ZIP intake

The source selector supports a local LAS, a downloaded ZIP, and a selective Zenodo
download. The 32 reviewed plots remain the only accepted sources. The original
acquisition adds the archive basename as an extraction directory, so source path
`.../originals/FORinstance_dataset/RMIT/test.las` maps to ZIP member
`RMIT/test.las`. Selection is exact; unrelated entries are never extracted.

Both ZIP readers cap an individual read at 2 MiB and refuse oversized directory
metadata. Enumeration is bounded to 1,024 entries, with duplicate/unsafe names
rejected. Selected members must be regular, unencrypted LAS files of the exact
reviewed size. CRC32 is checked during extraction; the unchanged Python adapter
then checks the full selected LAS SHA256 before preparation. Output goes to a
fixed temporary filename, never an archive-supplied filesystem path. ZIP64 and
Deflate are exercised offline, plus a literal-only Deflate64 decoder case.

The provider reader uses only the pinned public URL and explicit byte ranges. It
requires HTTP 206 and exact response length, checks Content-Range when exposed,
and caps cumulative transfer at the selected LAS size plus 8 MiB. If a server
ignores a range and returns HTTP 200, the response is cancelled before reading its
body. There is no automatic whole-archive download fallback. A local ZIP remains
available when CORS, throttling or range support prevents selective retrieval.

Selected input staging is included in quota preflight and removed after source
verification/preparation. The final ZIP retains intake kind, exact member,
compression, extracted size and provider request/byte counters. The original local
ZIP remains unchanged. The ZIP reader is the previously pinned zip.js 2.20.0,
now vendored with its license so intake regressions run offline.

[evidence/browser-archive-intake-validation.json](evidence/browser-archive-intake-validation.json)
records the actual Chromium-browser Zenodo acceptance: the complete RMIT test
plot was retrieved in 8 requests totaling 3,659,162 bytes from the 1,643,251,814-byte
archive. All 357,435 points passed independent native validation and both NPZ
checksums matched the prior native reference. A locally generated ZIP64 fixture
containing that complete unchanged plot also passed browser preparation. This
does not verify the entire archive or all plot schemas. The later expanded acceptance below also verifies this intake path in native
Firefox. The earlier Firefox complete-LAS result remains separate historical evidence.

## Expanded acceptance

[evidence/browser-expanded-acceptance.json](evidence/browser-expanded-acceptance.json)
adds native Firefox UI acceptance of direct Zenodo retrieval, source verification,
independent browser validation and ZIP generation for the complete RMIT test plot.
A new saved-ZIP native check was not repeated in that Firefox run.

Chromium also retrieved and prepared the complete CULS/plot_1_annotated.las,
which adds the native treeSP dimension. It transferred 19,615,280 bytes in 23
range requests, validated all 1,816,672 points in eight blocks and exported a ZIP.
The saved ZIP passed independent native validation. Every exported NPZ was
byte-identical to the existing audited native-prepared scene, whose eight payload
hashes were rechecked. This verifies native extra-attribute preservation for that
scene without defining a new meaning or feature normalization for treeSP.

The complete-plot browser coverage is now two plots and two of five native
schemas. It does not admit all 32 plots, establish geographic independence or
verify the checksum of the full provider ZIP.


## Task-bound requests

The task controls now select training, evaluation or inference requirements and
mandatory/optional measurements. The worker resolves the request against pinned
model 1.4 before source intake and validates it after complete payload validation.
Only reviewed partitions permitted for the chosen use appear in the selector.
The ZIP includes the saved plan, task validation and consumer-block evidence.
A source-native spectral candidate does not enable an unadmitted adapter.
See TASK-REQUIREMENTS.md for the executable contract and evidence scope.

## Source selection and run ownership

The preparation panel lists every reviewed source from the catalog. Its task
assessment enables execution only when the graph admits the requested output and
a browser implementation exists. FGI-EMIT and the other unadmitted adapters remain
visible with their review gaps; selecting them does not download or prepare data.
`profiles.js` dispatches only known implementation modules. FOR-instance-specific
membership paths and setup are isolated in `profiles/for-instance.js`. The worker
independently checks the selected source and admitted pipeline before source intake.

`RunSession` owns each worker and watchdog. Success, failure, cancellation and page
exit terminate that run and clear its timer; callbacks from an old worker cannot
change its successor. Temporary output identities remain recoverable or clearable
after an interrupted worker. Recovery labels the saved source/use rather than
presenting the previous ZIP as a result of newly selected requirements.
