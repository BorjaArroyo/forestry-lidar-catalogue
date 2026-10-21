# Instance-segmentation MVP

## Delivered workflow

The catalog connects source discovery and task requirements to reviewed plans,
source-specific preparation, independent validation and loadable dataset folders.
FOR-instance v1 is admitted for the 32 plots present in its pinned archive;
FGI-EMIT is admitted for all 19 plots after full native integrity and output
validation. Its three native reflectance channels retain separate validity masks.
See [FOR-instance](FOR-INSTANCE.md) and [FGI-EMIT](FGI-EMIT.md).

Workbench combines selections from both sources in one browser run and one ZIP.
Plans can be reviewed, exported and imported with exact dependency checks.
Source identities and published `dev`, `train` and `test` assignments remain
unchanged; optional absent measurements remain explicit omissions. Required
reflectance excludes FOR-instance before intake.

Zenodo runs now retain a checkpoint after each complete, independently validated
plot. Workbench discovers saved runs after reopening, offers explicit Resume,
Download result and Delete actions, and revalidates checkpoints before reuse.
Interrupted plots and downloads restart; an interrupted ZIP is rebuilt. Local
LAS/ZIP preparation retains its restart behavior. Browser storage can be evicted;
a downloaded ZIP remains the durable copy. See [browser scope](BROWSER-PREPARATION.md).

## Remaining reliability and scale gates

1. Extend bounded browser acceptance to larger selections and additional native
   schemas before claiming full-release browser scalability. Browser downloads
   verify selected LAS hashes, not whole provider archive checksums.
2. Retain reproducible evidence for downloaded ZIPs, native reader validation,
   byte equivalence and interrupted-run recovery as runtime versions change.
3. Reassess storage estimates and browser export behavior with larger outputs.
   Firefox macOS save-dialog behavior has a documented workaround.

## Remaining scientific and coverage work

1. Resolve the 50 absent NIBIO2 partition entries with upstream evidence before
   claiming coverage of all 82 FOR-instance partition rows.
2. Reconcile captures shared with FOR-instance V2 and define site/campaign groups
   before selecting geographically independent evaluation zones.
3. Review annotation completeness, boundary treatment, coordinate datum, capture
   ancestry and model exposure for each intended experiment. Provider splits and
   preparation validation do not establish independent evaluation.
4. Resolve FGI spectral units/calibration and nearest-neighbor association limits
   before claiming quantitative cross-source spectral compatibility.
5. Admit additional source adapters only after source-specific analysis,
   self-contained implementation and independent validation.

Training consumers, benchmarks, article evaluators, geometric curation and the
retired graph/image experiments remain outside this increment.
