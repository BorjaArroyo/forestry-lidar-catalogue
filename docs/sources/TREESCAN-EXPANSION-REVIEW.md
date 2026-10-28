# TreeScanPL10K expanded candidate audit

On 2026-10-27, four additional complete TreeScan clouds were selected and
inspected for a joint instance and tree-classification workflow. The maintainer
requested the audit and integration of this expansion on 2026-10-28. These four
plots join the two previously admitted plots in the bounded joint source lock.

## Selection

The 272-member ZIP central-directory inventory is recorded in
[`evidence/joint/treescan-zip-members.json`](../../evidence/joint/treescan-zip-members.json).
For each of the four chosen filename areas, exclude the two admitted plots and
rank plots with companion rows by distinct named species, then named-species row
count, then filename. Unknown code 0 and genus-only code 40 do not count as
named species. The selected members, companion distributions, input table hashes
and selection method are in
[`expanded-candidates.json`](../../evidence/joint/expanded-candidates.json).

The companion table is a selection hint. Its tree IDs do not establish joins to
native trees. Filename areas are useful for selecting different acquisition
contexts, but do not establish geographic independence. This intentionally
selected sample is not a representative or random estimate of the source.

## Full native audit

The audit downloaded each complete ZIP member using bounded ranges, checked its
central-directory size and CRC32, and computed the complete LAZ SHA256. It read
every point and checked required fields, integral nonnegative IDs and codes,
binary crown flags, finite coordinates, consistent code and crown for each
positive native tree across blocks, and taxonomy lookup coverage. Per-block and
whole native-record hashes, source member metadata, tree rows and companion
comparisons are recorded in
[`expanded-native-audit.json`](../../evidence/joint/expanded-native-audit.json).

| Plot                            |          Points | Positive tree IDs | Valid species | Valid genus/group |  Zero-ID points |
| ------------------------------- | --------------: | ----------------: | ------------: | ----------------: | --------------: |
| `Rem_Piensk_2016_2804302.laz`   |      72,044,066 |                37 |            23 |                29 |      56,996,746 |
| `Rem_Suprasl_2015_3501204.laz`  |      61,397,777 |                34 |            18 |                26 |      39,152,534 |
| `Rem_Milicz_2015_2303101.laz`   |      82,292,071 |                53 |            41 |                41 |      58,436,153 |
| `Rem_Katrynka_2016_5101105.laz` |      81,331,408 |                53 |            39 |                39 |      49,685,947 |
| **Total**                       | **297,065,322** |           **177** |       **121** |           **135** | **204,271,380** |

As in the first audit, zero-ID points have unavailable instance reference; they
are not certified background. Code 40 (`Quercus sp.`) supplies genus and group
but not species. The conifer/broadleaf mapping is the source-scoped taxonomy
mapping documented in the existing [joint review](TREESCAN-JOINT.md).

## Prepared-package validation

Native preparation and independent validation covered all four complete clouds:
297,065,322 points, 177 trees and 1,191 blocks. The species-target partial-reference
plan retained 121 eligible tree labels. The validation report, source lock hash and
implementation fingerprints are recorded in
[`expanded-package-validation.json`](../../evidence/joint/expanded-package-validation.json).
This validation does not establish correctness of the provider annotations.

## Companion comparison

At equal numeric tree IDs, the native and companion values disagree as follows:

| Plot     | Species code | Crown flag | Point count |
| -------- | -----------: | ---------: | ----------: |
| Piensk   |      25 / 37 |     4 / 37 |     34 / 37 |
| Suprasl  |      25 / 34 |     9 / 34 |     34 / 34 |
| Milicz   |      29 / 53 |    14 / 53 |     53 / 53 |
| Katrynka |      35 / 53 |    15 / 53 |     53 / 53 |

The native cloud fields remain the source of proposed labels. These comparisons
do not establish a matching permutation, so companion rows must not label cloud
points.

## Limits and next gate

The complete provider ZIP MD5 values were not checked. The audit establishes
internal consistency of native fields, not annotation correctness, completeness,
coordinate datum or evaluation independence. There is no reviewed train/test
split. One of the four new complete plots (Suprasl) passed browser preparation and
independent validation of the downloaded ZIP in Chromium. See the
[browser evidence](../../evidence/joint/browser-expanded-validation.json). The same plot also passed [pinned Zenodo range intake](../../evidence/joint/browser-zenodo-validation.json)
and native ZIP validation. The other three plots, Firefox and full-release browser
scalability remain unvalidated.

To reproduce the native audit, place the four original LAZ members and the three
pinned companion files listed in `metadata_assets` of the selection evidence in
one local input directory. Copy the recorded inventory into that directory as
`members.json`. Verify the LAZ hashes against the audit evidence, then run:

```sh
uv run --no-sync python -m canopy.joint.source --input /path/to/input --output /path/to/new-audit.json
```

The input companion files are hash-checked by the audit. Compare the resulting
`plots` records, native hashes and discrepancies with the recorded evidence.
This command audits; it does not grant scientific admission.
