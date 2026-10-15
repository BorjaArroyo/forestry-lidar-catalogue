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
hashes must match, and a human must audit the package before admission. A detected
input mismatch is a blocking finding; never update expected hashes merely to
make validation pass.
