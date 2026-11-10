# Tree taxonomy: current workflow

FOR-species20K and BioDiv-3DTrees have enabled, independently checked classification
preparations. Select taxonomy in Experiment, choose genus or species, select
published partitions and native observations, review the frozen plan, then prepare
and download the validated ZIP. Stored targets retain independent rank validity.

Install and check the existing metadata using the project environment:

```sh
uv sync --frozen --extra dev --extra classification
uv run --no-sync python -m canopy classification audit
uv run --no-sync python -m canopy classification plan --help
uv run --no-sync python -m canopy classification validate /absolute/dataset
```

## Scope and interpretation

| Source             | Recorded native scope                                                                                                                | Limits                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FOR-species20K v1  | 19,962 tree IDs/observations: 17,707 development and 2,255 public-unlabelled test entries.                                           | Test is inference-only for public taxonomy. Seven identical-cloud groups include four crossing dev/test; do not infer withheld labels. The reported 20,158 headline is not reconciled with audited membership. |
| BioDiv-3DTrees 1.0 | 4,952 tree IDs, each with TLS and ULS (9,904 observations). 213 labels resolve to genus only; five trees have no assigned partition. | All 27 recorded plots occur in train, validation and test. No identical-cloud groups were found. Native observations remain separate frames; matching tree IDs do not authorize fusion.                        |

Training uses development/train reference; validation uses the provider's validation
partition; evaluation requires public valid test reference. Inference retains
partial or absent reference. A genus-only tree can satisfy genus supervision but
cannot supply species truth. Published partitions and identities are preserved.
TLS and ULS observations of one physical tree retain a shared partition.

Native XYZ is the default input. Traits, QSM flags and derived variables are
provenance, not automatic model features or independent ground truth. BioDiv's
published QSM and graph archives are outside this classification preparation.
The source declares GPL-3.0-or-later for FOR and CC BY 4.0 for BioDiv; original
conditions remain attached to each source. No new rights review is claimed.

## Evidence

- [Complete native audit](../../evidence/classification/full-native-audit.json)
- [Frozen real browser selection](../../evidence/classification/full-acceptance-manifest.json)
- [Original-archive browser acceptance](../../evidence/classification/full-browser-acceptance-inference.json)
- [Paired native-view acceptance](../../evidence/classification/paired-browser-acceptance.json)
- [Shared source definitions and pending questions](../reviews/SOURCE-CONTENT.md)

Full native auditing and bounded browser acceptance are different evidence scopes.
The original-archive browser reports use locally downloaded originals and do not
establish full-release browser output scalability or live-provider reliability.
The native audit resolves the README's ULS/conifer inconsistency using complete
observed membership. It does not reconcile every QSM or graph representation.

The [original PR contribution and reproduction notes](../history/classification-contribution.md)
are historical, including WIP admission statements and retired filesystem paths.
They are retained for provenance, not as current setup instructions.

Frozen plans bind their original model and runtime snapshots. Re-review an older plan to create a current plan; use its matching checkout when exact old dependencies are required. Historical plans, validation reports and completed artifacts are never rewritten by catalogue regeneration.
