# Integrated classification workflow

Classification shares Sources, Workbench and the task graph. Install with `uv sync --extra dev --extra classification`. Use `uv run canopy classification audit` to verify pinned metadata, `uv run canopy classification plan --selection subsets.json --use training --rank genus` to resolve a request, and `uv run canopy classification validate /absolute/dataset` to independently validate an extracted ZIP.

Admission follows the segmentation evidence procedure, explicitly authorized by the maintainer. Reports below describe PR #10 and its historical WIP gate. New plans bind the integrated runtime and canonical execution gates; older plans require review again. Large inventories use deterministic gzip compression, preserving their decoded evidence bytes. Provider CSV line endings are preserved exactly.

## Original contribution documentation

This section preserves the historical PR #10 contribution, including its WIP
statements and original paths. The current canonical graph enables the reviewed
FOR-species20K and BioDiv-3DTrees classification routes; execution gates are
derived from that graph. Maintained code is under `src/canopy/classification/`
and metadata under `data/classification/`. Historical admission statements below
do not describe the integrated current state.

# Tree taxonomic classification

The new `task:species` path discovers FOR-species20K and BioDiv-3DTrees,
retains native taxonomic reference by rank, and implements browser-only ZIP
preparation. Complete native auditing runs **locally**, following the user's
2026-10-21 instruction. Both production sources remain **WIP** under the human
admission policy in [CONTRIBUTING.md](../../CONTRIBUTING.md). No deployment or source
admission has been performed.

## Delivery status

1. **Audit and contracts:** complete original label tables and all four original
   point archives audited locally: **24,914 source tree identities, 29,866 sensor
   observations and 10,107,832,979 points**. All provider MD5s, archive SHA256s,
   member hashes, native records, formats, attributes and block references are
   recorded in `evidence/classification/full-native-audit.json` and `native/`.
2. **FOR browser implementation:** selective local/remote ZIP intake and pinned
   laz-perf 0.0.7 decoding implemented. Four bounded real samples match native
   point-record references. Complete native references cover all original dev
   and test clouds, including the two LAS 1.4 / point-format 6 test clouds.
3. **BioDiv and composition:** sequential fzstd 0.1.1 / TAR intake, separate TLS
   and ULS observations, combined exports and independent revalidation implemented.
   Synthetic browser runs exercise paired complete/partial labels, all four
   uses, active-staging cancellation and second-source corruption. Real paired
   acceptance passed for all four uses in both Chromium and Firefox. Original
   BioDiv TLS/ULS traversal and selective original FOR ZIP intake also passed in
   both browsers, using the separate frozen real acceptance manifest.

The original segmentation graph, scientific adapters, package readers and v1/v2
plan checks retain their contracts. The new sources live in an explicitly WIP
proposal registry at `scripts/classification/source-lock.json`; they are not
inserted as admitted releases in `knowledge-model.json` or its generated catalog.
The browser checks source readiness independently for each task. Segmentation
and classification drafts have different storage keys, and switching tasks
preserves both selections.

## Original evidence

`scripts/classification/sources/` contains the original provider API responses,
two label tables and BioDiv README. Label bytes match published provider MD5s;
SHA256 and size are recorded in `evidence/classification/metadata-audit.json`.

| Source release         | Evidence currently established                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zenodo:13255198` (v1) | 17,707 dev label rows; 33 species, 19 genera; 12,485 TLS, 1,464 MLS and 3,758 ULS observations. All dev rows join actual cloud names by decimal `treeID`. The CSV `/train/*.las` filename is retained verbatim. There are 2,255 unlabelled test members. The nested `train.zip` contains 17,707 byte-identical aliases of the exterior dev clouds, adding no observations. Native point formats: 19,960 format 0 and two format 6. |
| `grodata:128035:1.0`   | Every one of the 4,952 label IDs has both TLS and ULS, including all 1,543 rows whose native type is `conifer`. This resolves the README contradiction using complete observed membership. There are 213 genus-only labels; 3,957 train, 495 validate, 495 test and five unassigned. All 27 plots occur in train, validate and test. All 9,904 clouds use point format 3.                                                          |

The FOR inventory totals 19,962 source tree IDs. Seven groups contain identical
cloud bytes under different IDs; four cross `dev` and `test`. These source-wide
findings are exported in `spatial-audit.json`. IDs and published partitions are
retained, and no test labels are inferred from duplicates. These groups differ
from the nested storage aliases of the same IDs. Published count differences
are not filled with invented trees. Test sensor and collection remain unknown
when not documented.

FOR declares GPL-3.0-or-later. BioDiv declares CC BY 4.0. Each source's original
conditions, record URL and native metadata remain separate in plans and exports.
Downloadability does not change those conditions.

## Classification contract

`tree_id` is scoped to a pinned source release. `observation_id` identifies the
sensor modality and native file within that release. BioDiv TLS and ULS share a
physical tree identity and have separate files and point records. They are never
merged or assumed to share a coordinate frame.

The versioned `canopy:tree-taxonomy:1.0.0` vocabulary contains all 54 known genus
and species nodes, stable codes, documented genus ancestry and exact native-label
crosswalks. No fuzzy matching, synonym substitution, or inferred family/order is
performed. `Quercus_spec` maps to genus `Quercus` with a null species; its genus
reference is valid and its species reference is invalid. Selecting a genus
includes documented descendants. Every ZIP includes the complete vocabulary,
independently of the selected trees.

| Use        | Published partitions                             | Reference                                                |
| ---------- | ------------------------------------------------ | -------------------------------------------------------- |
| training   | `dev`, `train`                                   | valid at the requested genus/species rank                |
| validation | `validate`                                       | valid at the requested rank; no FOR validation generated |
| evaluation | `test`                                           | valid at the requested rank; FOR test excluded           |
| inference  | `dev`, `train`, `validate`, `test`, `unassigned` | partial or absent reference allowed                      |

Full original trait rows (including height, DBH, QSM flags and derived variables)
are provenance. Only native XYZ is a default model input. No centering,
normalization, sampling, augmentation or coordinate corrections are applied.

## Plans and ZIPs

Classification plans use schema **3.0.0**, explicit `task_ref`, `source_ref`,
selection, observations, complete vocabulary, source dependency hashes, runtime
and code hashes. They declare disk and worker-memory estimates. Imports rebuild
the plan and reject stale or edited dependencies with `PLAN_REVIEW_REQUIRED`.
Legacy segmentation plans continue through their original readers; they are
never converted into classification requests.

The ZIP layout is:

```
dataset.json                   tree-classification-dataset:1.0.0
dataset-plan.json              exact v3 plan
vocabulary.json                complete versioned taxonomy and mappings
source-conditions.json         separate conditions for each release
spatial-audit.json             observed plot overlap; independence not demonstrated
browser-run.json               runtime, checks and scope
<published partition>/<source release>/observations/<index>/
    original.laz               byte-identical original cloud (or original.las)
    blocks/<offset>.records.bin native packed point records, all attributes
    blocks/<offset>.xyz.f64     native scaled XYZ, little-endian float64
```

An index identifies physical trees, sensor observations and storage blocks
separately. Blocks contain at most 250,000 points and are not additional trees.
Native files are included so the independent Python reader can reconstruct and
compare every raw record and XYZ value using laspy/lazrs.

```bash
python -m pip install -r scripts/classification/requirements-audit.txt
PYTHONPATH=scripts python -m classification.package /absolute/extracted-dataset
```

`TreeDataset.iter_observation()` yields bounded XYZ/record blocks with scalar
tree taxonomy and reference validity by rank. Call `validate()` before consuming
a partial iterator. Package validation does not certify source admission or
geographic independence.

## Intake and failure behavior

FOR reuses the selective ZIP reader with explicit audited member names and a
25,000-entry bound. It verifies ZIP CRC, member size, SHA256, decoded record hash
and every native reference block. Whole-provider ZIP MD5 remains explicitly
unchecked in selective intake, including local ZIP selection.

Each selected BioDiv archive is traversed once, sequentially and to completion.
TLS is **19,941,204,645 bytes**; ULS is **652,222,562 bytes**. Choosing a few trees
does not reduce those transfers. Original local `.tar.zst` files can be streamed
without uploads or holding the whole archive in RAM. Only selected members are
staged, one complete cloud at a time. LAZ decoding holds that cloud, bounded
record blocks and the decoder window; it does not hold the complete source.

All traversed compressed bytes must match the provider MD5, with SHA256 also
checked when audited. TAR headers, sizes, padding, paths, duplicate members and
end markers are checked. Links and unreviewed TAR extensions fail closed. A
framing guard checks concatenated Zstandard frames before allocation and caps
the window at 64 MiB; the callback queue is also bounded at 64 MiB. Browser
acceptance traverses complete original BioDiv archives; FOR keeps selective ZIP
intake and explicitly reports its whole-provider ZIP checksum as unchecked.

Corruption after a selected member, missing committed modalities, insufficient
storage, cancellation or a later-source failure prevents a validated ZIP.
Failure removes the run's staging. Temporary successful output can be cleared
from the UI. Browser output is temporary; download a completed ZIP to keep it.

## Reproducing evidence

```bash
# Rebuild metadata from the saved provider originals; no payload download.
python scripts/classification/snapshot.py

# Optional bounded remote ZIP directory/sample inspection.
PYTHONPATH=scripts python -m classification.sample_inventory

# Download the four original point archives locally, with provider checksums.
PYTHONPATH=scripts python -m classification.acquire --range-workers 4

# Native whole-source auditing, with a separate checkpoint per archive.
PYTHONPATH=scripts python -m classification.audit_local
PYTHONPATH=scripts python -m classification.complete_audit \
  --reports temp/classification/reproduced-native

# Refresh integrity pins after implementation review.
PYTHONPATH=scripts python -m classification.refresh_locks

python tests/test_classification.py
node --experimental-default-type=module --test tests/test_classification_intake.mjs

# Isolated synthetic acceptance; never changes production source admission.
python -m pip install -r scripts/classification/requirements-browser-tests.txt
python -m playwright install chromium firefox
python tests/classification_browser_acceptance.py

# Final real acceptance selection and complete original archive traversal.
PYTHONPATH=scripts python -m classification.freeze_acceptance
python tests/classification_browser_acceptance.py --full --use inference

# Four separate uses in both browsers, using exact exported native paired clouds.
python tests/classification_browser_acceptance.py --paired
```

`evidence/classification/acceptance-manifest.json` retains the initial prototype
scope. `full-acceptance-manifest.json` freezes the final real selection: nine tree
identities, 14 observations, 1,118,470 points and 18 blocks. It covers every native
point format (0, 3, 6), FOR TLS/MLS/ULS and unlabelled test, and five paired BioDiv
trees spanning complete/partial labels and every published partition category.
The original requirement to freeze the final samples before adapter prototyping
was not met: the manifest records that limitation explicitly. The final selection
was frozen before successful original-archive acceptance.

Browser reports record ZIP hashes, browser versions, independent validation,
allocated decoder heap and sampled process-tree RSS/PSS. RSS includes shared
pages more than once; PSS apportions them. These are observed peaks sampled every
0.5 seconds, not hard allocation limits. Native reports distinguish final
verification RSS from the four provisional decoder workers' individual peaks.
No raw clouds, complete archives, output ZIPs, or machine-specific paths are
published.

`paired-browser-acceptance.json` records eight real scenarios, using exact
original paired cloud bytes in small repackaged archives:

| Use, in each browser                              | Tree identities | Observations |    Points |
| ------------------------------------------------- | --------------: | -----------: | --------: |
| Training, genus reference                         |               5 |            7 |   268,284 |
| Published validation, species reference           |               1 |            2 |     7,706 |
| Evaluation, species reference                     |               1 |            2 |     8,480 |
| Inference, including partial and absent reference |               9 |           14 | 1,118,470 |

`full-browser-acceptance-inference.json` records the same frozen inference
selection prepared from original archives in both browsers. Each run traversed
all 19,941,204,645 TLS bytes and 652,222,562 ULS bytes once, verified provider MD5
and native SHA256, and selectively extracted the original FOR ZIP members. The
independent reader validated all 1,118,470 points, attributes and 18 blocks in
each downloaded ZIP. These runs used locally downloaded originals; live provider
transport and deployment were not exercised.

`real-browser-acceptance.json` additionally records Chromium and Firefox exports
of eight exact original cloud samples: 354,972 points in nine blocks. It includes
FOR TLS/MLS/ULS and unlabelled test, and BioDiv TLS/ULS with a genus-only label.
The samples use small repackaged archives; BioDiv views belong to different
physical trees. This evidence does not establish paired real-view coverage,
original-archive traversal, or whole-source equivalence.

Earlier Firefox attempts closed unexpectedly or failed the final TLS SHA256
check without offering a validated ZIP. The SHA256 failure did not record its
computed hash, so its cause remains undetermined. Two complete hash controls
(including 74 prefixes compared with Python and all five selected TLS clouds)
and the final full UI/OPFS/ZIP acceptance passed. `original-browser-attempts.json`
and `archive-hash-diagnostics.json` retain those outcomes. Checksum errors now
include the archive name and both hashes for future diagnosis.

Complete native and bounded browser evidence is recorded. The production
readiness gate remains closed pending maintainer admission under
[CONTRIBUTING.md](../../CONTRIBUTING.md); `production-readiness.json` checks that gate
with the actual shipped registry in both browsers. Publication requires a
separately confirmed deployment; local tests do not create a human approval.

On **2026-10-22**, the same implementation passed a fresh repeat: 144 Python
tests, 54 Node tests, seven native FOR-instance regression tests, 18 browser
preparation scenarios and both production readiness checks. Both browsers again
validated the original-archive export; the earlier SHA256 failure did not recur.
Fresh full-byte MD5/SHA256 checks matched all 47,792,581,756 original archive
bytes. Four pinned npm packages matched freshly retrieved registry tarballs,
and all 17 remote runtime artifacts matched their integrity pins. The complete
native point audit remains the 2026-10-21 audit, reused after those byte checks.
The [dated repeat report](../../evidence/classification/retests/2026-10-22/summary.json)
records scope, hashes and versions; prior browser reports are retained under
`evidence/classification/retests/2026-10-21/`.
