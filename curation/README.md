# Curation evidence and decisions

This is a review plan, not an executable transformation or an admitted pipeline.
Original and normalized payloads are unchanged. The JSON plan records metadata
fingerprints and explicit scope; the Markdown plan is its readable summary.
Current source-file size checks, when present, are separate evidence tied to the
same manifest/checkpoint fingerprint. They do not verify current payload hashes.

- [Readable plan](curation-plan.md)
- [Metadata evidence and candidate groups](curation-report.json)
- [Source-file check result](file-check-summary.json): all 15,400 files present
  with expected sizes; zero errors in this scope. Payloads were not rehashed.

## Decisions still required

1. Rehash candidate duplicates before approving a canonical reference or storage
   optimization. Complete recorded chunk sequences identify 398 normalized-copy
   groups, including 280 Wytham/TLS cross-source groups and 118 TLS groups that
   span train/validation-named folders. Folder names do not establish the official
   benchmark unit or protocol. Preserve shared identities across any later split.
   Five additional source-hash groups contain notebooks or embedded Git logs;
   they are support artifacts, not independent point-cloud captures.
2. Choose canonical references only after reviewing source rights, version,
   annotations and evaluation reservations. No canonical reference or deletion
   is approved by this plan. Similar tree names or point counts alone do not
   establish geometry equivalence. Near duplicates and reordered geometry remain
   outside the current audit.
3. Review schema semantics. The previous catalog audit identifies Lautx StemID
   and treeIDv1/v2 crosswalk gaps (1,036 files, including manual/automatic variants),
   FOR v1 classification gaps (32 files), and ForestSemantic-MS low vegetation /
   woody debris mappings (six files). Those are earlier audit findings, not new
   payload verification. Do not collapse annotation variants or map unknown
   labels to background without task-specific evidence and loss analysis.
4. Resolve physical capture/site identities before site-out evaluation. All
   5,626 verified normalized records still have unresolved site and split metadata;
   5,598 lack a recorded CRS. Missing CRS does not prove that coordinates differ,
   nor does a common CRS establish compatible units or height references.
5. Keep the three deferred derivative-rights cases blocked until reviewed.
   Dataset admission does not grant every intended use or transformation.
6. Build one complete dataset-specific pipeline package under PIPELINES.md.
   Include every mapping, dependency, fixture, input fingerprint, output contract
   and audit record. Analyze individual steps and their composition before human
   approval. This plan cannot be passed to a runner as execution authorization.

Any new correction proposal should state: affected inputs, observed defect,
proposed rule, evidence, information loss, task consequences, expected output,
validation and rollback/version strategy. Unresolved cases remain blocked.
