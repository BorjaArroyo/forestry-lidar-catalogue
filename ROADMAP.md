# Incremental delivery plan

Each increment ends with a tested, reviewable change. Do not treat planned
capabilities as available, and do not modify source payloads without a reviewed
curation plan.

1. Dataset admission: proposal template, analysis record, task assessments,
   snapshot validation and human PR review. Implemented; required GitHub branch
   protection and the first actual human admission reviews remain to be arranged.
2. Curation baseline: recheck integrity, exact/near duplicates, annotation variants
   and cross-source capture identities. Produce a dry-run correction plan with
   confidence, evidence and expected effects. Preserve originals. Metadata planning
   and source-size checks are implemented; geometric/semantic audit remains open.
   Every transformation needs prior analysis and audit under PIPELINES.md.
3. Traceable corrections: approve task-specific mappings, materialize versioned
   derivatives and record source hashes, recipe versions and split constraints.
   Generic normalization is blocked pending an audited self-contained package.
4. Acquisition UX: complete the destination-selection and execution-host flow
   around existing resumable Zenodo acquisition; validate realistic failure and
   recovery cases. Browser PLY inspection is already available independently.
5. One validated benchmark: select a method and protocol, pin source and OCI
   image digests, validate input adapters and run end to end before enabling it.
   Current registry entries are specifications, with execution disabled.
6. Expand the knowledge graph: add reviewed task affinities, implemented transfer
   functions, benchmark evidence and article caveats as the earlier steps provide
   evidence. No inferred model transferability from matching schemas alone.
