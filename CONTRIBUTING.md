# Dataset admission

Anyone can propose a dataset through a Dataset proposal issue. Only maintainers
publish catalog changes after analysis and human review in a pull request.
Downloading or inspecting a source does not admit it to this catalog.

Author curated entries in `data/knowledge-model.json`; profile, relationship and
catalog files are generated views. Follow [DATA-MODEL.md](docs/guides/DATA-MODEL.md) to
refresh and validate them. The storage model does not change admission rules.

## Process

1. Propose a version-specific provider record, intended tasks and motivation.
2. Analyze provenance, component licenses and intended-use restrictions,
   integrity, fields/units/CRS, annotations, coverage and shared identities.
   Record evidence, sampling scope and unresolved questions. Do not redistribute
   payloads or claim permission merely because a record is downloadable.
3. Assess every task separately: supported, conditional, unsupported or unknown.
   Record transformations, information loss and validation needed. Unlabelled
   data may support geometry checks without supporting supervised evaluation.
4. Submit a pull request containing the catalog entry, matching catalog.js and
   reviews/<record-id>.json, using reviews/template.json as the starting point.
   Hash the final dataset object using the validator's fingerprint function.
5. A maintainer reviews evidence and limitations before merging. Request changes,
   defer or reject proposals when evidence is insufficient. Admission is not a
   general training approval, benchmark certification or independent reproduction.

The admitted decision records a human judgment; CI checks completeness and the
snapshot fingerprint, not the truth of evidence or reviewer identity. Require
actual GitHub review before merge. Contributors must not self-approve by filling
in a name. Maintainers should configure branch protection to require the
Dataset admission check and an approving review. Repository templates and CI
alone do not prevent a maintainer from pushing directly or changing the policy.

## Existing collection

The ten initial records are a legacy snapshot with partial audits and unresolved
findings. They are not retrospectively certified as admitted. Unchanged entries
remain visible; any added or edited dataset requires a matching admission review.
Reassess reviews when source versions, rights, labels or intended uses change.
Deletion of a catalog record does not delete local data; explain removals in PRs.

## Review record

Copy reviews/template.json to reviews/<numeric-record-id>.json. Replace all
placeholders and supply evidence links or repository paths to inspectable reports.
Use unknown with a rationale when a task cannot yet be established. Admission
with limitations must make those limitations visible in the dataset entry too.
The template is a draft and intentionally cannot satisfy the admission check.

Run from the published repository root:

```bash
python -m canopy admission --base previous-catalog.json
```

Supply the previous committed catalog as the base; do not use the proposed file
as its own baseline. The GitHub PR check retrieves the base from Git history.
The validator uses Python standard-library modules only.
