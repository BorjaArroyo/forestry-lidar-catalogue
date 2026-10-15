# Prior analysis: TLS exact-duplicate index

Proposed artifact: a reference index for exact-byte duplicates within one pinned
Zenodo source. The existing review identifies 118 candidate groups across train /
validation-named folders. No payload deletion, canonical selection, label mapping,
geometry transformation or benchmark split correction is authorized.

Composition: verify the declared files, then group only matching current SHA-256
and size values. This avoids treating an old manifest hash as present verification.
Every file in a selected group must pass before any report directory is created.
Candidate groups cannot be promoted to independent capture identities merely from
filenames. The resulting index requires human review before any later correction.

Loss analysis: all input bytes remain unchanged. Indexing does not establish
near-duplicate geometry, annotation quality, intended-use rights or an official
benchmark protocol. Sampling validates only the explicitly reported subset.
Full validation reads 1.88 GB; ordinary operation uses a 1 MiB input buffer.
Missing files, incorrect hashes/sizes, source/path mismatch, symlinks, observed
in-flight source changes, package tampering and existing output paths block
validation. Synthetic tests check these boundaries; real-data sampling checks the
entrypoint against recorded provider inputs. Restart failed validation with a new
output directory. No resume or rollback of source data is required.

This package is an offline validation prototype. Its Python validation entrypoint
is complete and has no third-party dependencies or network calls. It is not yet
an admitted executable pipeline: the pinned OCI build environment must be validated, all declared input
hashes must match and the affected combination must pass technical validation. A detected
input mismatch is a blocking finding; never update expected hashes merely to
make validation pass.


## Version 0.2 prior analysis: input materialization

Observed SHA mismatches on a WebDAV volume can disappear on later reads without
changing expected hashes. Reading files directly during a transformation would
couple results to that unstable access path. Materialization is a byte-preserving
input-preparation step: full length + pinned source SHA + local read-back are
mandatory, and validation then reads the local snapshot independently. The step
records retries rather than erasing earlier failures. It cannot bless permanent
corruption or changed manifests. Partial failed copies are removed; their hashes
and failures remain in staging-report.json. Source identities, labels, units and
CRS are unchanged. Synthetic tests inject transient/short/corrupt reads, local
read-back corruption, persistent mismatches and unsafe paths. Required real-data
evidence is full 236-file materialization and independent host/container checks.
This is an operational isolation strategy; the underlying WebDAV cause remains
unconfirmed. Repeated execution of this validated existing combination needs no
new human approval; new source/schema/task combinations require prior analysis.
