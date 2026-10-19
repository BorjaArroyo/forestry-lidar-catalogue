# Instance-segmentation MVP

## FOR-instance v1: validated narrow path

Source discovery and comparison lead to a pinned Zenodo download and a local,
self-contained preparation for the 32 LAS plots in that archive. Native rows and
attributes, conservative reference masks, source/output checksums and exact
published dev/test assignments are retained. Existing matching outputs resume.
The 50 absent NIBIO2 partition entries remain explicit; they are not invented.
Full input and output validation is pinned to the exact implementation/package.
The [task-package contract](TASK-PACKAGE.md) now has an independent validator and
streaming reader. The local download-and-prepare workflow requires complete
prepared-package validation before completion and retains the report hash.
Browser preparation now has bounded Firefox acceptance for one complete reviewed
plot, including native byte-equivalence and ZIP export. See BROWSER-PREPARATION.md.
Selective ZIP intake now retrieves one reviewed plot from Zenodo without the whole
archive. Expanded acceptance covers Firefox direct intake for RMIT and Chromium intake
for CULS, including byte-identical preservation of its additional native attribute.
Full-archive verification and coverage across the other native schemas remain pending.

## Next increment: a second source through the existing workflow

Prioritize FGI-EMIT, pinned record
[19351234](https://zenodo.org/records/19351234), before adding consumers,
benchmark execution or other product features. This is a candidate selection,
not execution admission: its preparation stays TBD until validation is complete.

The [official repository](https://github.com/ruoppa/fgi_emit) documents 19 plots
from Espoonlahti, Finland, with plot-local tree instances and multispectral ALS
attributes. This complements FOR-instance's five UAV collections and tests
whether the existing representation can express different source semantics.
The local acquisition contains 19 LAS files and saved verified manifests; their
payload hashes still need to be rechecked for the new package. Existing research
conversion code is evidence to review, not an admitted task adapter.

The measurement-metadata increment is complete: see [FGI-EMIT](../FGI-EMIT.md).
All headers and bounded prefixes are reviewed; full-payload integrity and the
executable adapter remain pending. The existing source detail displays these
descriptors without changing preparation readiness.

Remaining admission work:

1. Reverify the pinned assets and all original plots; audit label counts,
   instance coverage, native attributes, coordinate metadata and source terms
   (CC BY-NC-SA 4.0). Record explicit assumptions and unresolved questions.
2. Define a source-specific, lossless preparation policy. Preserve boundary
   points and their masks, radiometric fields, native classes and plot-local IDs.
   FGI-EMIT class 2 means building, not FOR-instance terrain. Review the historical
   converter's point removal, class offsets and coordinate shift before reuse.
3. Preserve the official 13 training / 6 test assignments. Keep the three
   recommended validation plots as an optional protocol, not a silent rewrite.
   These plots belong to one acquisition area; they are not 19 independent zones.
   Audit capture ancestry and model exposure before claiming independent transfer.
4. Validate all 19 plots and source/output provenance, then admit the package to
   the existing download-and-prepare workflow and check FOR-instance regression.
   No new benchmark or model integration is part of this increment.

## Remaining scientific and coverage work

1. Resolve the archive's missing NIBIO2 scope with upstream evidence before
   claiming coverage of all 82 partition rows.
2. Reconcile physical captures shared with FOR-instance V2 and define site/campaign
   groups before selecting geographically independent evaluation zones.
3. Review annotation completeness, boundary treatment, vertical datum and model
   exposure for each intended experiment. The preparation mask is conservative,
   not a reproduced article evaluator or independent accuracy claim.
4. Admit each additional source/adapter only after the same source-specific
   analysis, self-contained package and validation process. Other adapters stay TBD.

Broader tasks, graph exploration, article audits, benchmarks, geometric curation
and image-registry integration remain deferred. Their old experimental code is
archived and is not reactivated by this pipeline.
